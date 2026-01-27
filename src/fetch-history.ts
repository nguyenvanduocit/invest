import { fetchHistory as fetchInternationalHistory } from './sources/international/index'
import { fetchAllRates } from './sources/exchange-rate/index'
import type { HistoricalPrice, FetchResult } from './types'

const TAEL_GRAMS = 37.5

interface NormalizedHistoricalPrice {
  date: string
  usdPerOunce: number
  usdPerGram: number
  vndPerGram: number
  vndPerTael: number
}

interface HistoricalData {
  international: NormalizedHistoricalPrice[]
  exchangeRate: {
    usdVnd: number
    fetchedAt: string
  }
}

async function fetchHistoricalData(days: number): Promise<FetchResult<HistoricalData>> {
  console.log(`Fetching ${days}-day historical data...\n`)

  // Get exchange rate for conversion
  const ratesResult = await fetchAllRates()
  if (ratesResult.ok === false) {
    return { ok: false, error: `Exchange rates: ${ratesResult.error}` }
  }
  const vndRate = ratesResult.data['VND'] ?? 25000

  // Fetch international history
  const intlResult = await fetchInternationalHistory(days)
  if (intlResult.ok === false) {
    return { ok: false, error: `International: ${intlResult.error}` }
  }

  // Normalize to VND
  const normalized: NormalizedHistoricalPrice[] = intlResult.data.data.map(p => ({
    date: p.date,
    usdPerOunce: p.pricePerOunce ?? 0,
    usdPerGram: p.pricePerGram,
    vndPerGram: p.pricePerGram * vndRate,
    vndPerTael: p.pricePerGram * vndRate * TAEL_GRAMS
  }))

  return {
    ok: true,
    data: {
      international: normalized,
      exchangeRate: {
        usdVnd: vndRate,
        fetchedAt: new Date().toISOString()
      }
    }
  }
}

function formatNumber(n: number, decimals = 0): string {
  return n.toLocaleString(undefined, { maximumFractionDigits: decimals })
}

async function main() {
  const days = parseInt(process.argv[2] ?? '30')

  const result = await fetchHistoricalData(days)
  if (result.ok === false) {
    console.error('Failed:', result.error)
    process.exit(1)
  }

  const { data } = result

  console.log('='.repeat(90))
  console.log(`GOLD PRICE HISTORY (${days} days) - Converted to VND`)
  console.log('='.repeat(90))
  console.log(`Exchange rate: 1 USD = ${formatNumber(data.exchangeRate.usdVnd, 2)} VND`)
  console.log('')

  // Table header
  console.log(
    'Date'.padEnd(12) +
    'USD/oz'.padStart(12) +
    'USD/g'.padStart(10) +
    'VND/g'.padStart(15) +
    'VND/tael'.padStart(18) +
    'Change'.padStart(10)
  )
  console.log('-'.repeat(90))

  // Calculate daily changes
  let prevPrice = 0
  for (const p of data.international) {
    const change = prevPrice > 0
      ? ((p.vndPerGram - prevPrice) / prevPrice * 100)
      : 0
    const changeStr = prevPrice > 0
      ? `${change >= 0 ? '+' : ''}${change.toFixed(2)}%`
      : '-'

    console.log(
      p.date.padEnd(12) +
      formatNumber(p.usdPerOunce, 2).padStart(12) +
      formatNumber(p.usdPerGram, 2).padStart(10) +
      formatNumber(p.vndPerGram).padStart(15) +
      formatNumber(p.vndPerTael).padStart(18) +
      changeStr.padStart(10)
    )
    prevPrice = p.vndPerGram
  }

  // Summary
  const first = data.international[0]
  const last = data.international.at(-1)
  if (first && last) {
    const totalChange = ((last.vndPerGram - first.vndPerGram) / first.vndPerGram * 100)
    const avgPrice = data.international.reduce((sum, p) => sum + p.vndPerGram, 0) / data.international.length

    console.log('')
    console.log('='.repeat(90))
    console.log('SUMMARY')
    console.log('-'.repeat(90))
    console.log(`Period: ${first.date} to ${last.date} (${data.international.length} days)`)
    console.log(`Start:  ${formatNumber(first.vndPerTael)} VND/tael ($${formatNumber(first.usdPerOunce, 2)}/oz)`)
    console.log(`End:    ${formatNumber(last.vndPerTael)} VND/tael ($${formatNumber(last.usdPerOunce, 2)}/oz)`)
    console.log(`Change: ${totalChange >= 0 ? '+' : ''}${totalChange.toFixed(2)}%`)
    console.log(`Average: ${formatNumber(avgPrice * TAEL_GRAMS)} VND/tael`)

    // Find min/max
    const sorted = [...data.international].sort((a, b) => a.vndPerGram - b.vndPerGram)
    const min = sorted[0]
    const max = sorted.at(-1)
    if (min && max) {
      console.log(`Min:    ${formatNumber(min.vndPerTael)} VND/tael on ${min.date}`)
      console.log(`Max:    ${formatNumber(max.vndPerTael)} VND/tael on ${max.date}`)
    }
  }

  // Save to file
  const jsonOutput = {
    fetchedAt: new Date().toISOString(),
    days,
    exchangeRate: data.exchangeRate,
    data: data.international
  }

  await Bun.write('data/history.json', JSON.stringify(jsonOutput, null, 2))
  console.log('\nSaved to data/history.json')

  // Also save CSV for easy charting
  const csvLines = [
    'date,usd_per_oz,usd_per_gram,vnd_per_gram,vnd_per_tael',
    ...data.international.map(p =>
      `${p.date},${p.usdPerOunce.toFixed(2)},${p.usdPerGram.toFixed(2)},${p.vndPerGram.toFixed(0)},${p.vndPerTael.toFixed(0)}`
    )
  ]
  await Bun.write('data/history.csv', csvLines.join('\n'))
  console.log('Saved to data/history.csv')
}

main().catch(console.error)
