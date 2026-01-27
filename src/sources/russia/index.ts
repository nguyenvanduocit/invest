import type { FetchResult, GoldPrice, GoldSource } from '../../types'

// Russia gold price calculated from international + USD/RUB exchange rate
// Since CBR website requires JavaScript rendering

const EXCHANGE_RATE_API = 'https://api.exchangerate-api.com/v4/latest/USD'

interface ExchangeRateResponse {
  rates: Record<string, number>
  date: string
}

// Alternative: goldprice.org XML feed
const GOLDPRICE_XML = 'https://data-asg.goldprice.org/dbXRates/RUB'

interface GoldPriceOrgResponse {
  items: Array<{
    curr: string
    xauPrice: number
    xagPrice: number
    chgXau: number
    date: string
  }>
}

async function fetchFromGoldPriceOrg(): Promise<FetchResult<GoldPrice[]>> {
  try {
    const res = await fetch(GOLDPRICE_XML, {
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

    const rubItem = json.items.find(i => i.curr === 'RUB')
    if (!rubItem) {
      return { ok: false, error: 'RUB price not found' }
    }

    const TROY_OUNCE_TO_GRAM = 31.1035
    const pricePerOunce = rubItem.xauPrice
    const pricePerGram = pricePerOunce / TROY_OUNCE_TO_GRAM

    return {
      ok: true,
      data: [{
        source: 'GoldPrice.org-RUB',
        country: 'Russia',
        currency: 'RUB',
        pricePerOunce,
        pricePerGram,
        timestamp: new Date(rubItem.date),
        raw: rubItem
      }]
    }
  } catch (e) {
    return { ok: false, error: String(e) }
  }
}

// Fallback: calculate from USD price + exchange rate
async function fetchCalculated(xauusdPrice: number): Promise<FetchResult<GoldPrice[]>> {
  try {
    const res = await fetch(EXCHANGE_RATE_API)
    if (!res.ok) {
      return { ok: false, error: `HTTP ${res.status}` }
    }
    const json = await res.json() as ExchangeRateResponse

    const rubRate = json.rates['RUB']
    if (!rubRate) {
      return { ok: false, error: 'RUB rate not found' }
    }

    const TROY_OUNCE_TO_GRAM = 31.1035
    const pricePerOunceRUB = xauusdPrice * rubRate
    const pricePerGramRUB = pricePerOunceRUB / TROY_OUNCE_TO_GRAM

    return {
      ok: true,
      data: [{
        source: 'Calculated (XAUUSD × USD/RUB)',
        country: 'Russia',
        currency: 'RUB',
        pricePerOunce: pricePerOunceRUB,
        pricePerGram: pricePerGramRUB,
        timestamp: new Date(json.date),
        raw: { xauusdPrice, rubRate }
      }]
    }
  } catch (e) {
    return { ok: false, error: String(e) }
  }
}

export async function fetchAll(xauusdPrice?: number): Promise<FetchResult<GoldPrice[]>> {
  // Try goldprice.org first
  const result = await fetchFromGoldPriceOrg()
  if (result.ok) return result

  // Fallback to calculation if we have XAUUSD price
  if (xauusdPrice) {
    return fetchCalculated(xauusdPrice)
  }

  return { ok: false, error: 'Could not fetch Russia gold price' }
}

export const russiaSource: GoldSource = {
  name: 'Russia Gold',
  country: 'Russia',
  fetch: () => fetchAll()
}

if (import.meta.main) {
  console.log('Fetching Russia gold prices...')
  // Test with approximate current XAUUSD price
  const result = await fetchAll(2700)
  if (result.ok) {
    console.log('Russia Gold Prices:')
    for (const p of result.data) {
      console.log(`  ${p.source}: ${p.pricePerGram?.toLocaleString(undefined, { maximumFractionDigits: 2 })} RUB/g`)
    }
  } else if (result.ok === false) {
    console.error('Error:', result.error)
  }
}
