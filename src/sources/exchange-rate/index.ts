import type { FetchResult } from '../../types'

export interface ExchangeRate {
  from: string
  to: string
  rate: number
  timestamp: Date
  source: string
}

// Free exchange rate API
const EXCHANGE_RATE_API = 'https://api.exchangerate-api.com/v4/latest/USD'

interface ExchangeRateResponse {
  rates: Record<string, number>
  date: string
}

export async function fetchUSDVND(): Promise<FetchResult<ExchangeRate>> {
  try {
    const res = await fetch(EXCHANGE_RATE_API)
    if (!res.ok) {
      return { ok: false, error: `HTTP ${res.status}` }
    }
    const json = await res.json() as ExchangeRateResponse

    const vndRate = json.rates['VND']
    if (!vndRate) {
      return { ok: false, error: 'VND rate not found' }
    }

    return {
      ok: true,
      data: {
        from: 'USD',
        to: 'VND',
        rate: vndRate,
        timestamp: new Date(json.date),
        source: 'exchangerate-api.com'
      }
    }
  } catch (e) {
    return { ok: false, error: String(e) }
  }
}

export async function fetchMultiple(currencies: string[]): Promise<FetchResult<ExchangeRate[]>> {
  try {
    const res = await fetch(EXCHANGE_RATE_API)
    if (!res.ok) {
      return { ok: false, error: `HTTP ${res.status}` }
    }
    const json = await res.json() as ExchangeRateResponse

    const rates: ExchangeRate[] = []
    for (const currency of currencies) {
      const rate = json.rates[currency]
      if (rate) {
        rates.push({
          from: 'USD',
          to: currency,
          rate,
          timestamp: new Date(json.date),
          source: 'exchangerate-api.com'
        })
      }
    }

    return { ok: true, data: rates }
  } catch (e) {
    return { ok: false, error: String(e) }
  }
}

// Fetch all rates needed for gold price conversion
export async function fetchAllRates(): Promise<FetchResult<Record<string, number>>> {
  const result = await fetchMultiple(['VND', 'CNY', 'RUB', 'INR'])
  if (result.ok === false) {
    return { ok: false, error: result.error }
  }

  const rates: Record<string, number> = { USD: 1 }
  for (const r of result.data) {
    rates[r.to] = r.rate
  }
  return { ok: true, data: rates }
}

if (import.meta.main) {
  console.log('Fetching exchange rates...')
  const result = await fetchMultiple(['VND', 'CNY', 'RUB', 'INR'])
  if (result.ok) {
    console.log('Exchange Rates (vs USD):')
    for (const r of result.data) {
      console.log(`  ${r.to}: ${r.rate.toLocaleString()}`)
    }
  } else if (result.ok === false) {
    console.error('Error:', result.error)
  }
}
