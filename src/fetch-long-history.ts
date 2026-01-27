// Fetch extended historical data (1 year, 5 years, etc.)

import { fetchAllRates } from './sources/exchange-rate/index'

const FREEGOLD_JSON = 'https://freegoldapi.com/data/latest.json'
const TROY_OUNCE_TO_GRAM = 31.1035
const TAEL_GRAMS = 37.5

interface FreeGoldRecord {
  date: string
  price: number
  source: string
}

interface HistoricalPoint {
  date: string
  usdPerOunce: number
  usdPerGram: number
  vndPerGram: number
  vndPerTael: number
}

async function fetchLongHistory(years: number = 1): Promise<HistoricalPoint[]> {
  console.log(`Fetching ${years} year(s) of historical data...`)

  // Get exchange rate
  const ratesResult = await fetchAllRates()
  const vndRate = ratesResult.ok ? ratesResult.data['VND'] : 25000
  console.log(`Exchange rate: 1 USD = ${vndRate.toLocaleString()} VND`)

  // Fetch all data
  const res = await fetch(FREEGOLD_JSON)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)

  const allData = await res.json() as FreeGoldRecord[]
  console.log(`Total records in API: ${allData.length}`)

  // Filter to yahoo_finance source (reliable USD data from ~2000s)
  const yahooData = allData.filter(r => r.source === 'yahoo_finance')
  console.log(`Yahoo Finance records: ${yahooData.length}`)

  // Calculate cutoff date
  const cutoffDate = new Date()
  cutoffDate.setFullYear(cutoffDate.getFullYear() - years)
  const cutoffStr = cutoffDate.toISOString().split('T')[0]

  // Filter and convert
  const filtered = yahooData
    .filter(r => r.date >= cutoffStr)
    .map(r => ({
      date: r.date,
      usdPerOunce: r.price,
      usdPerGram: r.price / TROY_OUNCE_TO_GRAM,
      vndPerGram: (r.price / TROY_OUNCE_TO_GRAM) * vndRate,
      vndPerTael: (r.price / TROY_OUNCE_TO_GRAM) * vndRate * TAEL_GRAMS
    }))

  console.log(`Filtered records (${years}y): ${filtered.length}`)

  return filtered
}

function calculateStats(data: HistoricalPoint[]) {
  const prices = data.map(d => d.usdPerOunce)
  const min = Math.min(...prices)
  const max = Math.max(...prices)
  const avg = prices.reduce((a, b) => a + b, 0) / prices.length
  const current = prices.at(-1) || 0
  const first = prices[0] || 0

  // Find dates
  const minDate = data.find(d => d.usdPerOunce === min)?.date
  const maxDate = data.find(d => d.usdPerOunce === max)?.date

  // Volatility (annualized)
  const returns = prices.slice(1).map((p, i) => Math.log(p / prices[i]))
  const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length
  const variance = returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length
  const dailyVol = Math.sqrt(variance)
  const annualVol = dailyVol * Math.sqrt(252) * 100 // 252 trading days

  return {
    min, max, avg, current, first,
    minDate, maxDate,
    totalChange: ((current - first) / first) * 100,
    annualizedVolatility: annualVol,
    dataPoints: data.length
  }
}

async function main() {
  const years = parseInt(process.argv[2] || '1')

  const data = await fetchLongHistory(years)
  const stats = calculateStats(data)

  console.log('\n' + '='.repeat(70))
  console.log(`GOLD PRICE STATISTICS (${years} year${years > 1 ? 's' : ''})`)
  console.log('='.repeat(70))

  console.log(`\nPeriod: ${data[0]?.date} to ${data.at(-1)?.date}`)
  console.log(`Data points: ${stats.dataPoints}`)

  console.log('\n📊 USD/oz Statistics:')
  console.log(`   Current:  $${stats.current.toLocaleString(undefined, { maximumFractionDigits: 2 })}`)
  console.log(`   Start:    $${stats.first.toLocaleString(undefined, { maximumFractionDigits: 2 })}`)
  console.log(`   Change:   ${stats.totalChange >= 0 ? '+' : ''}${stats.totalChange.toFixed(2)}%`)
  console.log(`   Min:      $${stats.min.toLocaleString(undefined, { maximumFractionDigits: 2 })} (${stats.minDate})`)
  console.log(`   Max:      $${stats.max.toLocaleString(undefined, { maximumFractionDigits: 2 })} (${stats.maxDate})`)
  console.log(`   Average:  $${stats.avg.toLocaleString(undefined, { maximumFractionDigits: 2 })}`)
  console.log(`   Volatility: ${stats.annualizedVolatility.toFixed(1)}% (annualized)`)

  // Save data
  const output = {
    fetchedAt: new Date().toISOString(),
    years,
    stats,
    data
  }

  await Bun.write(`data/history-${years}y.json`, JSON.stringify(output, null, 2))
  console.log(`\nSaved to data/history-${years}y.json`)

  // CSV
  const csv = [
    'date,usd_per_oz,usd_per_gram,vnd_per_gram,vnd_per_tael',
    ...data.map(d => `${d.date},${d.usdPerOunce.toFixed(2)},${d.usdPerGram.toFixed(2)},${d.vndPerGram.toFixed(0)},${d.vndPerTael.toFixed(0)}`)
  ].join('\n')

  await Bun.write(`data/history-${years}y.csv`, csv)
  console.log(`Saved to data/history-${years}y.csv`)
}

main().catch(console.error)
