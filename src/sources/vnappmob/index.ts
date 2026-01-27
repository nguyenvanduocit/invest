// VNAppMob Gold API - Vietnam SJC gold prices (current only, no historical)
// API docs: https://vapi.vnappmob.com/gold.v2.html

import type { FetchResult } from '../../types'

const API_KEY = process.env.VNAPPMOB_API_KEY
const BASE_URL = 'https://vapi.vnappmob.com/api/v2/gold'

interface VNAppMobPrice {
  buy_1l: string    // Buy price per 1 lượng (tael) - string from API
  sell_1l: string   // Sell price per 1 lượng (tael) - string from API
  datetime: string  // Unix timestamp as string
}

interface VNAppMobResponse {
  results: VNAppMobPrice[]
}

export interface VietnamCurrentPrice {
  date: string
  buyPrice: number   // VND per tael
  sellPrice: number  // VND per tael
}

function formatDate(date: Date): string {
  return date.toISOString().split('T')[0]
}

export async function fetchCurrent(): Promise<FetchResult<VietnamCurrentPrice>> {
  if (!API_KEY) {
    return { ok: false, error: 'VNAPPMOB_API_KEY not set' }
  }

  try {
    const res = await fetch(`${BASE_URL}/sjc`, {
      headers: {
        'Authorization': `Bearer ${API_KEY}`,
        'Accept': 'application/json'
      }
    })

    if (!res.ok) {
      return { ok: false, error: `HTTP ${res.status}` }
    }

    const json = await res.json() as VNAppMobResponse

    if (!json.results || json.results.length === 0) {
      return { ok: false, error: 'No data in response' }
    }

    const latest = json.results[0]

    return {
      ok: true,
      data: {
        date: formatDate(new Date()),
        buyPrice: parseFloat(latest.buy_1l),
        sellPrice: parseFloat(latest.sell_1l)
      }
    }
  } catch (e) {
    return { ok: false, error: String(e) }
  }
}

if (import.meta.main) {
  console.log('Testing VNAppMob API...\n')

  const current = await fetchCurrent()
  if (current.ok) {
    console.log(`Current SJC price (${current.data.date}):`)
    console.log(`  Buy:  ${current.data.buyPrice.toLocaleString()} VND/lượng`)
    console.log(`  Sell: ${current.data.sellPrice.toLocaleString()} VND/lượng`)
  } else if (current.ok === false) {
    console.error('Error:', current.error)
  }
}
