import type { FetchResult, GoldPrice, GoldSource } from '../../types'

// China gold price from goldprice.org API
const GOLDPRICE_API = 'https://data-asg.goldprice.org/dbXRates/CNY'

interface GoldPriceOrgResponse {
  items: Array<{
    curr: string
    xauPrice: number
    xagPrice: number
    chgXau: number
    date: string
  }>
}

const TROY_OUNCE_TO_GRAM = 31.1035

async function fetchFromGoldPriceOrg(): Promise<FetchResult<GoldPrice[]>> {
  try {
    const res = await fetch(GOLDPRICE_API, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
      }
    })
    if (!res.ok) {
      return { ok: false, error: `HTTP ${res.status}` }
    }

    const json = await res.json() as GoldPriceOrgResponse

    if (!json.items || json.items.length === 0) {
      return { ok: false, error: 'No items in response' }
    }

    const cnyItem = json.items.find(i => i.curr === 'CNY')
    if (!cnyItem) {
      return { ok: false, error: 'CNY price not found' }
    }

    const pricePerOunce = cnyItem.xauPrice
    const pricePerGram = pricePerOunce / TROY_OUNCE_TO_GRAM

    return {
      ok: true,
      data: [{
        source: 'GoldPrice.org-CNY',
        country: 'China',
        currency: 'CNY',
        pricePerOunce,
        pricePerGram,
        timestamp: new Date(cnyItem.date),
        raw: cnyItem
      }]
    }
  } catch (e) {
    return { ok: false, error: String(e) }
  }
}

// Fallback: calculate from USD price + exchange rate
const EXCHANGE_RATE_API = 'https://api.exchangerate-api.com/v4/latest/USD'

interface ExchangeRateResponse {
  rates: Record<string, number>
  date: string
}

async function fetchCalculated(xauusdPrice: number): Promise<FetchResult<GoldPrice[]>> {
  try {
    const res = await fetch(EXCHANGE_RATE_API)
    if (!res.ok) {
      return { ok: false, error: `HTTP ${res.status}` }
    }
    const json = await res.json() as ExchangeRateResponse

    const cnyRate = json.rates['CNY']
    if (!cnyRate) {
      return { ok: false, error: 'CNY rate not found' }
    }

    const pricePerOunceCNY = xauusdPrice * cnyRate
    const pricePerGramCNY = pricePerOunceCNY / TROY_OUNCE_TO_GRAM

    return {
      ok: true,
      data: [{
        source: 'Calculated (XAUUSD × USD/CNY)',
        country: 'China',
        currency: 'CNY',
        pricePerOunce: pricePerOunceCNY,
        pricePerGram: pricePerGramCNY,
        timestamp: new Date(json.date),
        raw: { xauusdPrice, cnyRate }
      }]
    }
  } catch (e) {
    return { ok: false, error: String(e) }
  }
}

export async function fetchAll(xauusdPrice?: number): Promise<FetchResult<GoldPrice[]>> {
  // Try goldprice.org API first
  const result = await fetchFromGoldPriceOrg()
  if (result.ok) return result

  // Fallback to calculation
  if (xauusdPrice) {
    return fetchCalculated(xauusdPrice)
  }

  return { ok: false, error: 'Could not fetch China gold price' }
}

export const chinaSource: GoldSource = {
  name: 'China Gold (SGE)',
  country: 'China',
  fetch: () => fetchAll()
}

if (import.meta.main) {
  console.log('Fetching China gold prices...')
  const result = await fetchAll(2700)
  if (result.ok) {
    console.log('China Gold Prices:')
    for (const p of result.data) {
      console.log(`  ${p.source}: ${p.pricePerGram?.toLocaleString(undefined, { maximumFractionDigits: 2 })} CNY/g`)
    }
  } else if (result.ok === false) {
    console.error('Error:', result.error)
  }
}
