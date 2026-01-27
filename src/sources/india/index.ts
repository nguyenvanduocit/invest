import * as cheerio from 'cheerio'
import type { FetchResult, GoldPrice, GoldSource } from '../../types'

// IBJA (India Bullion and Jewellers Association) rates
const IBJA_URL = 'https://ibjarates.com/'

// Metals.dev API (100 free requests/month)
const METALS_DEV_API = 'https://api.metals.dev/v1'
const METALS_DEV_KEY = process.env.METALS_DEV_KEY

interface MetalsDevResponse {
  metals: {
    gold: number // USD per troy ounce
  }
  currencies: {
    INR: number
  }
}

async function fetchFromMetalsDev(): Promise<FetchResult<GoldPrice[]>> {
  if (!METALS_DEV_KEY) {
    return { ok: false, error: 'METALS_DEV_KEY not set' }
  }

  try {
    const res = await fetch(`${METALS_DEV_API}/latest?api_key=${METALS_DEV_KEY}&currency=INR&unit=gram`)
    if (!res.ok) {
      return { ok: false, error: `HTTP ${res.status}` }
    }
    const json = await res.json() as { metals: { gold: number } }

    return {
      ok: true,
      data: [{
        source: 'Metals.dev',
        country: 'India',
        currency: 'INR',
        pricePerGram: json.metals.gold,
        timestamp: new Date(),
        raw: json
      }]
    }
  } catch (e) {
    return { ok: false, error: String(e) }
  }
}

async function fetchFromIBJA(): Promise<FetchResult<GoldPrice[]>> {
  try {
    const res = await fetch(IBJA_URL)
    if (!res.ok) {
      return { ok: false, error: `HTTP ${res.status}` }
    }
    const html = await res.text()
    const $ = cheerio.load(html)

    const prices: GoldPrice[] = []

    // IBJA displays rates in a table format
    // Gold 999 (24K), Gold 995, Gold 916 (22K), etc.
    $('table').each((_, table) => {
      $(table).find('tr').each((_, row) => {
        const cells = $(row).find('td')
        if (cells.length >= 2) {
          const label = $(cells[0]).text().trim().toLowerCase()
          const priceText = $(cells[1]).text().trim()

          if (label.includes('gold') || label.includes('999') || label.includes('995')) {
            const price = parseFloat(priceText.replace(/[^0-9.]/g, ''))
            if (price > 0) {
              // IBJA quotes prices per 10 grams, convert to per gram
              const pricePerGram = price / 10
              prices.push({
                source: `IBJA-${label}`,
                country: 'India',
                currency: 'INR',
                pricePerGram,
                timestamp: new Date(),
                raw: { label, priceText, note: 'Original price per 10g' }
              })
            }
          }
        }
      })
    })

    // Also check for specific price elements
    $('[class*="price"], [class*="rate"], [class*="gold"]').each((_, el) => {
      const text = $(el).text()
      // Indian gold prices are typically 6000-8000 INR per gram for 24K
      const match = text.match(/₹?\s*(\d{4,5}(?:\.\d{2})?)\s*(?:per\s*gram|\/g)?/i)
      if (match) {
        const price = parseFloat(match[1])
        if (price > 5000 && price < 10000) {
          prices.push({
            source: 'IBJA-Page',
            country: 'India',
            currency: 'INR',
            pricePerGram: price,
            timestamp: new Date(),
            raw: { matched: text.slice(0, 100) }
          })
        }
      }
    })

    if (prices.length === 0) {
      return { ok: false, error: 'No IBJA price data found' }
    }

    return { ok: true, data: prices }
  } catch (e) {
    return { ok: false, error: String(e) }
  }
}

// All India Bullion Association
const AIB_URL = 'https://allindiabullion.com/'

async function fetchFromAIB(): Promise<FetchResult<GoldPrice[]>> {
  try {
    const res = await fetch(AIB_URL)
    if (!res.ok) {
      return { ok: false, error: `HTTP ${res.status}` }
    }
    const html = await res.text()
    const $ = cheerio.load(html)

    const prices: GoldPrice[] = []

    // Look for gold prices on the page
    $('body').find('*').each((_, el) => {
      const text = $(el).text()
      // Look for patterns like "₹7,234" or "Rs. 7234" or "INR 7,234"
      if (text.includes('24K') || text.includes('24 Karat') || text.includes('999')) {
        const match = text.match(/(?:₹|Rs\.?|INR)\s*(\d{1,2},?\d{3}(?:\.\d{2})?)/i)
        if (match) {
          const price = parseFloat(match[1].replace(/,/g, ''))
          if (price > 5000 && price < 10000) {
            prices.push({
              source: 'AIB-24K',
              country: 'India',
              currency: 'INR',
              pricePerGram: price,
              timestamp: new Date(),
              raw: { matched: text.slice(0, 100) }
            })
          }
        }
      }
    })

    if (prices.length === 0) {
      return { ok: false, error: 'No AIB price data found' }
    }

    // Dedupe
    const seen = new Set<number>()
    const unique = prices.filter(p => {
      if (seen.has(p.pricePerGram!)) return false
      seen.add(p.pricePerGram!)
      return true
    })

    return { ok: true, data: unique }
  } catch (e) {
    return { ok: false, error: String(e) }
  }
}

export async function fetchAll(): Promise<FetchResult<GoldPrice[]>> {
  const results = await Promise.all([
    fetchFromMetalsDev(),
    fetchFromIBJA(),
    fetchFromAIB()
  ])

  const all: GoldPrice[] = []
  const errors: string[] = []

  for (const result of results) {
    if (result.ok) {
      all.push(...result.data)
    } else {
      errors.push(result.error)
    }
  }

  if (all.length === 0) {
    return { ok: false, error: errors.join('; ') }
  }

  return { ok: true, data: all }
}

export const indiaSource: GoldSource = {
  name: 'India Gold (IBJA/MCX)',
  country: 'India',
  fetch: fetchAll
}

if (import.meta.main) {
  console.log('Fetching India gold prices...')
  const result = await fetchAll()
  if (result.ok) {
    console.log('India Gold Prices:')
    for (const p of result.data) {
      console.log(`  ${p.source}: ₹${p.pricePerGram?.toFixed(2)}/g`)
    }
  } else {
    console.error('Error:', result.error)
  }
}
