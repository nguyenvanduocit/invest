// Fetch extended historical data (1 year, 5 years, etc.)

import { fetchAllRates } from './sources/exchange-rate/index'
import { fetchHistory as fetchTwelveDataHistory } from './sources/twelvedata/index'
import { TAEL_GRAMS, TROY_OUNCE_GRAMS } from './constants'

interface HistoricalPoint {
  date: string
  usdPerOunce: number
  usdPerGram: number
  vndPerGram: number
  vndPerTael: number
}

interface Stats {
  min: number
  max: number
  avg: number
  current: number
  first: number
  minDate: string | undefined
  maxDate: string | undefined
  totalChange: number
  annualizedVolatility: number
  dataPoints: number
}

async function fetchLongHistory(years: number = 1): Promise<HistoricalPoint[]> {
  console.log(`Fetching ${years} year(s) of historical data...`)

  // Get exchange rate
  const ratesResult = await fetchAllRates()
  const vndRate = ratesResult.ok ? ratesResult.data['VND'] : 25000
  console.log(`Exchange rate: 1 USD = ${vndRate.toLocaleString()} VND`)

  // Fetch from TwelveData (max 5000 points ≈ 19 years)
  const days = Math.min(years * 365, 5000)
  const result = await fetchTwelveDataHistory(days)

  if (result.ok === false) {
    throw new Error(result.error)
  }

  console.log(`TwelveData records: ${result.data.data.length}`)

  // Convert to our format with null-safe operator
  const data: HistoricalPoint[] = result.data.data.map(r => ({
    date: r.date,
    usdPerOunce: r.pricePerOunce ?? (r.pricePerGram * TROY_OUNCE_GRAMS),
    usdPerGram: r.pricePerGram,
    vndPerGram: r.pricePerGram * vndRate,
    vndPerTael: r.pricePerGram * vndRate * TAEL_GRAMS
  }))

  console.log(`Filtered records (${years}y): ${data.length}`)

  return data
}

function calculateStats(data: HistoricalPoint[]): Stats {
  const prices = data.map(d => d.usdPerOunce)
  const min = Math.min(...prices)
  const max = Math.max(...prices)
  const avg = prices.reduce((a, b) => a + b, 0) / prices.length
  const current = prices.at(-1) ?? 0
  const first = prices[0] ?? 0

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
    totalChange: first > 0 ? ((current - first) / first) * 100 : 0,
    annualizedVolatility: annualVol,
    dataPoints: data.length
  }
}

async function main(): Promise<void> {
  const years = parseInt(process.argv[2] ?? '1')

  if (isNaN(years) || years < 1) {
    console.error('Usage: bun run history:long [years]')
    console.error('  years: 1-19 (default: 1)')
    process.exit(1)
  }

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
}

main().catch(console.error)
