// Fetch Vietnam SJC historical data from webgia.com

import type { FetchResult } from '../../types'

export interface VietnamHistoricalPrice {
  date: string
  sellPrice: number  // VND per tael
  buyPrice: number   // VND per tael
}

export interface VietnamHistory {
  source: string
  data: VietnamHistoricalPrice[]
}

// webgia.com chart data format: [[timestamp_ms, price_in_millions], ...]
type ChartDataPoint = [number, number]

// Vietnam timezone offset (UTC+7)
const VIETNAM_TZ_OFFSET_MS = 7 * 60 * 60 * 1000

/**
 * Parse chart data from webgia.com HTML
 * Note: Regex patterns are fragile and may break if website changes format
 */
function parseChartData(html: string): { sell: ChartDataPoint[], buy: ChartDataPoint[] } {
  // Extract sell data (series "Bán ra") and buy data (series "Mua vào")
  // Pattern matches: name:"Bán ra",data:[[...]]
  const sellMatch = html.match(/name:"Bán ra",data:\[\[([^\]]+\])+\]/s)
  const buyMatch = html.match(/name:"Mua vào",data:\[\[([^\]]+\])+\]/s)

  const parsePoints = (match: RegExpMatchArray | null): ChartDataPoint[] => {
    if (!match) return []
    const dataStr = match[0].match(/data:(\[\[.+?\]\])/s)?.[1]
    if (!dataStr) return []
    try {
      return JSON.parse(dataStr)
    } catch {
      return []
    }
  }

  return {
    sell: parsePoints(sellMatch),
    buy: parsePoints(buyMatch)
  }
}

/**
 * Convert timestamp to Vietnam date string (YYYY-MM-DD)
 * Handles timezone correctly for Vietnam (UTC+7)
 */
function timestampToVietnamDate(timestampMs: number): string {
  // Add Vietnam timezone offset to get correct local date
  const vietnamTime = new Date(timestampMs + VIETNAM_TZ_OFFSET_MS)
  return vietnamTime.toISOString().split('T')[0]
}

export async function fetchVietnamHistory(period: '1month' | '1year' = '1year'): Promise<FetchResult<VietnamHistory>> {
  const url = period === '1month'
    ? 'https://webgia.com/gia-vang/sjc/bieu-do-1-thang.html'
    : 'https://webgia.com/gia-vang/sjc/bieu-do-1-nam.html'

  try {
    const res = await fetch(url)
    if (!res.ok) {
      return { ok: false, error: `HTTP ${res.status}` }
    }

    const html = await res.text()
    const { sell, buy } = parseChartData(html)

    if (sell.length === 0) {
      return { ok: false, error: 'No data found in chart. Website format may have changed.' }
    }

    // Merge sell and buy data by timestamp
    const dataMap = new Map<number, { sell: number, buy: number }>()

    for (const [ts, price] of sell) {
      dataMap.set(ts, { sell: price, buy: 0 })
    }
    for (const [ts, price] of buy) {
      const existing = dataMap.get(ts)
      if (existing) {
        existing.buy = price
      }
    }

    // Convert to our format with proper timezone handling
    const data: VietnamHistoricalPrice[] = Array.from(dataMap.entries())
      .map(([ts, prices]) => ({
        date: timestampToVietnamDate(ts),
        sellPrice: prices.sell * 1_000_000,  // Convert millions to VND
        buyPrice: prices.buy * 1_000_000
      }))
      .sort((a, b) => a.date.localeCompare(b.date))

    return {
      ok: true,
      data: {
        source: 'webgia.com',
        data
      }
    }
  } catch (e) {
    return { ok: false, error: String(e) }
  }
}

if (import.meta.main) {
  console.log('Fetching Vietnam SJC historical data...\n')

  const result = await fetchVietnamHistory('1year')

  if (result.ok === false) {
    console.error('Error:', result.error)
    process.exit(1)
  }

  const { data } = result.data
  console.log(`Source: ${result.data.source}`)
  console.log(`Data points: ${data.length}`)
  console.log(`Period: ${data[0]?.date} to ${data.at(-1)?.date}`)

  // Stats with null safety
  const prices = data.map(d => d.sellPrice)
  const min = Math.min(...prices)
  const max = Math.max(...prices)
  const first = prices[0] ?? 0
  const last = prices.at(-1) ?? 0
  const change = first > 0 ? ((last - first) / first) * 100 : 0

  console.log(`\n📊 SJC Statistics:`)
  console.log(`   Start:  ${(first / 1_000_000).toFixed(1)}M VND`)
  console.log(`   End:    ${(last / 1_000_000).toFixed(1)}M VND`)
  console.log(`   Change: ${change >= 0 ? '+' : ''}${change.toFixed(2)}%`)
  console.log(`   Min:    ${(min / 1_000_000).toFixed(1)}M VND`)
  console.log(`   Max:    ${(max / 1_000_000).toFixed(1)}M VND`)

  // Save
  await Bun.write('data/vietnam-history-1y.json', JSON.stringify({
    fetchedAt: new Date().toISOString(),
    source: result.data.source,
    dataPoints: data.length,
    data
  }, null, 2))
  console.log('\nSaved to data/vietnam-history-1y.json')
}
