import type { FetchResult, GoldPrice, GoldPriceHistory, HistoricalPrice, GoldSource } from '../../types'

// FreeGoldAPI endpoints
const FREEGOLD_JSON = 'https://freegoldapi.com/data/latest.json'

interface FreeGoldRecord {
  date: string
  price: number
  source: string
}

const TROY_OUNCE_TO_GRAM = 31.1035

async function fetchXAUUSD(): Promise<FetchResult<GoldPrice[]>> {
  try {
    const res = await fetch(FREEGOLD_JSON)
    if (!res.ok) {
      return { ok: false, error: `HTTP ${res.status}` }
    }
    const json = await res.json() as FreeGoldRecord[]

    // Get the most recent price (data is sorted chronologically, latest is at the end)
    const recentRecords = json.filter(r =>
      r.source === 'yahoo_finance' ||
      r.source.includes('kitco') ||
      r.source.includes('lbma')
    )
    const latest = recentRecords.at(-1) || json.at(-1)

    if (!latest) {
      return { ok: false, error: 'No price data in response' }
    }

    const pricePerOunce = latest.price
    const pricePerGram = pricePerOunce / TROY_OUNCE_TO_GRAM

    return {
      ok: true,
      data: [{
        source: `FreeGoldAPI (${latest.source})`,
        country: 'International',
        currency: 'USD',
        pricePerOunce,
        pricePerGram,
        timestamp: new Date(latest.date),
        raw: latest
      }]
    }
  } catch (e) {
    return { ok: false, error: String(e) }
  }
}

export async function fetchHistory(days: number): Promise<FetchResult<GoldPriceHistory>> {
  try {
    const res = await fetch(FREEGOLD_JSON)
    if (!res.ok) {
      return { ok: false, error: `HTTP ${res.status}` }
    }
    const json = await res.json() as FreeGoldRecord[]

    // Filter to yahoo_finance source (most reliable recent data)
    const yahooRecords = json.filter(r => r.source === 'yahoo_finance')

    // Get last N days
    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() - days)
    const cutoffStr = cutoffDate.toISOString().split('T')[0]

    const recentData: HistoricalPrice[] = yahooRecords
      .filter(r => r.date >= cutoffStr)
      .map(r => ({
        date: r.date,
        pricePerOunce: r.price,
        pricePerGram: r.price / TROY_OUNCE_TO_GRAM,
        currency: 'USD'
      }))

    return {
      ok: true,
      data: {
        source: 'FreeGoldAPI',
        country: 'International',
        currency: 'USD',
        data: recentData
      }
    }
  } catch (e) {
    return { ok: false, error: String(e) }
  }
}

// GoldAPI.io backup source (requires API key)
const GOLDAPI_KEY = process.env.GOLDAPI_KEY

async function fetchFromGoldAPI(): Promise<FetchResult<GoldPrice[]>> {
  if (!GOLDAPI_KEY) {
    return { ok: false, error: 'GOLDAPI_KEY not set' }
  }

  try {
    const res = await fetch('https://www.goldapi.io/api/XAU/USD', {
      headers: { 'x-access-token': GOLDAPI_KEY }
    })
    if (!res.ok) {
      return { ok: false, error: `HTTP ${res.status}` }
    }
    const json = await res.json() as {
      price: number
      timestamp: number
    }

    return {
      ok: true,
      data: [{
        source: 'GoldAPI.io',
        country: 'International',
        currency: 'USD',
        pricePerOunce: json.price,
        pricePerGram: json.price / TROY_OUNCE_TO_GRAM,
        timestamp: new Date(json.timestamp * 1000),
        raw: json
      }]
    }
  } catch (e) {
    return { ok: false, error: String(e) }
  }
}

export async function fetchAll(): Promise<FetchResult<GoldPrice[]>> {
  const result = await fetchXAUUSD()
  if (result.ok) return result

  if (GOLDAPI_KEY) {
    return fetchFromGoldAPI()
  }

  return result
}

export const internationalSource: GoldSource = {
  name: 'International XAUUSD',
  country: 'International',
  fetch: fetchAll,
  fetchHistory
}

if (import.meta.main) {
  console.log('Fetching international gold price...')
  const result = await fetchAll()
  if (result.ok) {
    const p = result.data[0]
    console.log(`XAUUSD: $${p?.pricePerOunce?.toFixed(2)}/oz ($${p?.pricePerGram?.toFixed(2)}/g)`)
  } else {
    console.error('Error:', result.error)
  }

  console.log('\nFetching 30-day history...')
  const history = await fetchHistory(30)
  if (history.ok) {
    console.log(`Got ${history.data.data.length} data points`)
    const latest = history.data.data.at(-1)
    const oldest = history.data.data.at(0)
    if (latest && oldest) {
      const change = ((latest.pricePerGram - oldest.pricePerGram) / oldest.pricePerGram * 100).toFixed(2)
      console.log(`30-day change: ${change}%`)
    }
  } else {
    console.error('Error:', history.error)
  }
}
