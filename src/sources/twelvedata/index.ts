import type { FetchResult, GoldPrice, GoldPriceHistory, HistoricalPrice, GoldSource } from '../../types'
import { TROY_OUNCE_GRAMS } from '../../constants'

const API_KEY = process.env.TWELVEDATA_API_KEY
const BASE_URL = 'https://api.twelvedata.com'

interface TwelveDataMeta {
  symbol: string
  interval: string
  currency_base: string
  currency_quote: string
  type: string
}

interface TwelveDataValue {
  datetime: string
  open: string
  high: string
  low: string
  close: string
}

interface TwelveDataResponse {
  meta: TwelveDataMeta
  values: TwelveDataValue[]
  status: string
  code?: number
  message?: string
}

export async function fetchCurrent(): Promise<FetchResult<GoldPrice[]>> {
  if (!API_KEY) {
    return { ok: false, error: 'TWELVEDATA_API_KEY not set' }
  }

  try {
    const url = `${BASE_URL}/time_series?symbol=XAU/USD&interval=1day&outputsize=1&apikey=${API_KEY}`
    const res = await fetch(url)
    if (!res.ok) {
      return { ok: false, error: `HTTP ${res.status}` }
    }

    const json = await res.json() as TwelveDataResponse
    if (json.status !== 'ok') {
      return { ok: false, error: json.message ?? 'API error' }
    }

    const latest = json.values[0]
    if (!latest) {
      return { ok: false, error: 'No data returned' }
    }

    const pricePerOunce = parseFloat(latest.close)
    const pricePerGram = pricePerOunce / TROY_OUNCE_GRAMS

    return {
      ok: true,
      data: [{
        source: 'TwelveData',
        country: 'International',
        currency: 'USD',
        pricePerOunce,
        pricePerGram,
        timestamp: new Date(latest.datetime),
        raw: latest
      }]
    }
  } catch (e) {
    return { ok: false, error: String(e) }
  }
}

export async function fetchHistory(days: number): Promise<FetchResult<GoldPriceHistory>> {
  if (!API_KEY) {
    return { ok: false, error: 'TWELVEDATA_API_KEY not set' }
  }

  try {
    // Request more days to account for weekends/holidays
    const outputSize = Math.min(days + 15, 5000)
    const url = `${BASE_URL}/time_series?symbol=XAU/USD&interval=1day&outputsize=${outputSize}&apikey=${API_KEY}`

    const res = await fetch(url)
    if (!res.ok) {
      return { ok: false, error: `HTTP ${res.status}` }
    }

    const json = await res.json() as TwelveDataResponse
    if (json.status !== 'ok') {
      return { ok: false, error: json.message ?? 'API error' }
    }

    // Filter to requested date range
    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() - days)
    const cutoffStr = cutoffDate.toISOString().split('T')[0]

    // Values are returned newest first, reverse for chronological order
    const historicalData: HistoricalPrice[] = json.values
      .filter(v => v.datetime >= cutoffStr)
      .map(v => ({
        date: v.datetime,
        pricePerOunce: parseFloat(v.close),
        pricePerGram: parseFloat(v.close) / TROY_OUNCE_GRAMS,
        currency: 'USD'
      }))
      .reverse()

    return {
      ok: true,
      data: {
        source: 'TwelveData',
        country: 'International',
        currency: 'USD',
        data: historicalData
      }
    }
  } catch (e) {
    return { ok: false, error: String(e) }
  }
}

export const twelveDataSource: GoldSource = {
  name: 'TwelveData XAU/USD',
  country: 'International',
  fetch: fetchCurrent,
  fetchHistory
}

if (import.meta.main) {
  console.log('Testing TwelveData API...\n')

  const current = await fetchCurrent()
  if (current.ok) {
    const p = current.data[0]
    console.log(`Current: $${p?.pricePerOunce?.toFixed(2)}/oz ($${p?.pricePerGram?.toFixed(2)}/g)`)
  } else if (current.ok === false) {
    console.error('Current price error:', current.error)
  }

  console.log('\nFetching 30-day history...')
  const history = await fetchHistory(30)
  if (history.ok) {
    console.log(`Got ${history.data.data.length} trading days`)
    const first = history.data.data[0]
    const last = history.data.data.at(-1)
    if (first && last) {
      const change = ((last.pricePerGram - first.pricePerGram) / first.pricePerGram * 100).toFixed(2)
      console.log(`Range: ${first.date} to ${last.date}`)
      console.log(`Change: ${change}%`)
    }
  } else if (history.ok === false) {
    console.error('History error:', history.error)
  }
}
