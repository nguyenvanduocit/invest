import * as cheerio from 'cheerio'
import type { FetchResult, GoldPrice, GoldSource } from '../../types'

// Direct scraping from gold price websites
const GIAVANG_URL = 'https://giavang.org/'
const TYGIA_URL = 'https://tygia.com/gia-vang.html'

async function fetchFromGiaVang(): Promise<FetchResult<GoldPrice[]>> {
  try {
    const res = await fetch(GIAVANG_URL, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
      }
    })
    if (!res.ok) {
      return { ok: false, error: `HTTP ${res.status}` }
    }
    const html = await res.text()
    const $ = cheerio.load(html)

    const prices: GoldPrice[] = []
    const seen = new Set<string>()

    // giavang.org has sections: "Giá vàng Miếng SJC" and "Giá vàng Nhẫn SJC"
    // Find section headers to determine gold type
    let currentType = 'Miếng' // default

    $('h2, table').each((_, el) => {
      if (el.tagName === 'h2') {
        const h2Text = $(el).text().toLowerCase()
        if (h2Text.includes('nhẫn')) {
          currentType = 'Nhẫn'
        } else if (h2Text.includes('miếng')) {
          currentType = 'Miếng'
        }
        return
      }

      // Process table
      $(el).find('tr').each((_, row) => {
        const cells = $(row).find('td')
        if (cells.length >= 3) {
          const name = $(cells[0]).text().trim()
          const buyText = $(cells[1]).text().trim()
          const sellText = $(cells[2]).text().trim()

          // Parse prices (format: 175.300)
          const buyPrice = parseFloat(buyText.replace(/[.,]/g, ''))
          const sellPrice = parseFloat(sellText.replace(/[.,]/g, ''))

          if (buyPrice > 0 && sellPrice > 0 && name.toLowerCase().includes('sjc')) {
            // Create unique key to avoid duplicates
            const key = `${currentType}-${sellPrice}`
            if (seen.has(key)) return
            seen.add(key)

            prices.push({
              source: `SJC ${currentType}`,
              country: 'Vietnam',
              currency: 'VND',
              pricePerTael: sellPrice * 1000,
              buyPrice: buyPrice * 1000,
              sellPrice: sellPrice * 1000,
              timestamp: new Date(),
              raw: { name, buyText, sellText, type: currentType }
            })
          }
        }
      })
    })

    if (prices.length === 0) {
      return { ok: false, error: 'No SJC prices found on giavang.org' }
    }

    return { ok: true, data: prices }
  } catch (e) {
    return { ok: false, error: String(e) }
  }
}

// Alternative: goldprice.org Vietnam
const GOLDPRICE_VN_URL = 'https://goldprice.org/gold-price-vietnam.html'

async function fetchFromGoldPriceOrg(): Promise<FetchResult<GoldPrice[]>> {
  try {
    const res = await fetch(GOLDPRICE_VN_URL, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
      }
    })
    if (!res.ok) {
      return { ok: false, error: `HTTP ${res.status}` }
    }
    const html = await res.text()
    const $ = cheerio.load(html)

    const prices: GoldPrice[] = []

    // Look for price data in the page
    const text = $('body').text()

    // goldprice.org shows prices in VND per gram and per ounce
    // Look for VND prices (typically millions for per ounce)
    const vndPerGramMatch = text.match(/(\d{1,3}(?:,\d{3})*(?:\.\d+)?)\s*VND\s*(?:per|\/)\s*(?:gram|g)/i)
    const vndPerOzMatch = text.match(/(\d{1,3}(?:,\d{3})*(?:\.\d+)?)\s*VND\s*(?:per|\/)\s*(?:ounce|oz)/i)

    if (vndPerGramMatch) {
      const pricePerGram = parseFloat(vndPerGramMatch[1].replace(/,/g, ''))
      prices.push({
        source: 'GoldPriceOrg-VN',
        country: 'Vietnam',
        currency: 'VND',
        pricePerGram,
        pricePerTael: pricePerGram * 37.5, // 1 tael = 37.5g
        timestamp: new Date(),
        raw: { matched: vndPerGramMatch[0] }
      })
    }

    if (vndPerOzMatch) {
      const pricePerOunce = parseFloat(vndPerOzMatch[1].replace(/,/g, ''))
      const pricePerGram = pricePerOunce / 31.1035
      prices.push({
        source: 'GoldPriceOrg-VN-Oz',
        country: 'Vietnam',
        currency: 'VND',
        pricePerOunce,
        pricePerGram,
        pricePerTael: pricePerGram * 37.5,
        timestamp: new Date(),
        raw: { matched: vndPerOzMatch[0] }
      })
    }

    // Also look for embedded script data
    $('script').each((_, script) => {
      const content = $(script).html() || ''
      const priceMatch = content.match(/["']price["']\s*:\s*(\d+(?:\.\d+)?)/i)
      if (priceMatch) {
        const price = parseFloat(priceMatch[1])
        // Could be per gram or per ounce depending on context
        if (price > 1000000) { // Likely per ounce in VND
          prices.push({
            source: 'GoldPriceOrg-Embedded',
            country: 'Vietnam',
            currency: 'VND',
            pricePerOunce: price,
            pricePerGram: price / 31.1035,
            timestamp: new Date(),
            raw: { matched: priceMatch[0] }
          })
        }
      }
    })

    if (prices.length === 0) {
      return { ok: false, error: 'No Vietnam prices found on goldprice.org' }
    }

    return { ok: true, data: prices }
  } catch (e) {
    return { ok: false, error: String(e) }
  }
}

// Backup: goldpricez.com
const GOLDPRICEZ_URL = 'https://goldpricez.com/vn/gram'

async function fetchFromGoldPricez(): Promise<FetchResult<GoldPrice[]>> {
  try {
    const res = await fetch(GOLDPRICEZ_URL, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
      }
    })
    if (!res.ok) {
      return { ok: false, error: `HTTP ${res.status}` }
    }
    const html = await res.text()
    const $ = cheerio.load(html)

    const prices: GoldPrice[] = []

    // Look for price displays
    $('[class*="price"], [class*="rate"], [class*="gold"]').each((_, el) => {
      const text = $(el).text()
      // Vietnam prices are in millions VND
      const match = text.match(/(\d{1,3}(?:,\d{3})*(?:\.\d+)?)\s*(?:₫|VND|đ)/i)
      if (match) {
        const price = parseFloat(match[1].replace(/,/g, ''))
        // Sanity check - VND per gram should be around 2-3 million
        if (price > 1000000 && price < 5000000) {
          prices.push({
            source: 'GoldPricez-VN',
            country: 'Vietnam',
            currency: 'VND',
            pricePerGram: price,
            pricePerTael: price * 37.5,
            timestamp: new Date(),
            raw: { matched: text.slice(0, 100) }
          })
        }
      }
    })

    if (prices.length === 0) {
      return { ok: false, error: 'No prices found on goldpricez.com' }
    }

    // Dedupe
    const seen = new Set<number>()
    const unique = prices.filter(p => {
      const key = Math.round(p.pricePerGram || 0)
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })

    return { ok: true, data: unique }
  } catch (e) {
    return { ok: false, error: String(e) }
  }
}

export async function fetchAll(): Promise<FetchResult<GoldPrice[]>> {
  const results = await Promise.all([
    fetchFromGiaVang(),
    fetchFromGoldPriceOrg(),
    fetchFromGoldPricez()
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

export const vietnamSource: GoldSource = {
  name: 'Vietnam Gold (SJC/DOJI/PNJ)',
  country: 'Vietnam',
  fetch: fetchAll
}

if (import.meta.main) {
  const result = await fetchAll()
  if (result.ok) {
    console.log('Vietnam Gold Prices:')
    for (const p of result.data) {
      if (p.pricePerTael) {
        console.log(`  ${p.source}: ${p.pricePerTael.toLocaleString()} VND/tael`)
      } else if (p.pricePerGram) {
        console.log(`  ${p.source}: ${p.pricePerGram.toLocaleString()} VND/g`)
      }
    }
  } else {
    console.error('Error:', result.error)
  }
}
