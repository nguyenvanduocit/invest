import * as cheerio from 'cheerio'
import type { FetchResult, PremiumDiscount } from '../../types'

// World Gold Council premium/discount data
const WGC_CHINA_URL = 'https://www.gold.org/goldhub/data/gold-premium'

interface WGCPremiumData {
  china?: PremiumDiscount
  india?: PremiumDiscount
}

async function fetchFromWGC(): Promise<FetchResult<WGCPremiumData>> {
  try {
    const res = await fetch(WGC_CHINA_URL)
    if (!res.ok) {
      return { ok: false, error: `HTTP ${res.status}` }
    }
    const html = await res.text()
    const $ = cheerio.load(html)

    const data: WGCPremiumData = {}

    // WGC page contains charts and data tables for premium/discount
    // Look for embedded JSON data or table values
    $('script').each((_, script) => {
      const content = $(script).html() || ''

      // Look for premium data in embedded JSON
      const chinaMatch = content.match(/china[^}]*premium[^}]*:\s*(-?\d+(?:\.\d+)?)/i)
      const indiaMatch = content.match(/india[^}]*premium[^}]*:\s*(-?\d+(?:\.\d+)?)/i)

      if (chinaMatch) {
        data.china = {
          country: 'China',
          premium: parseFloat(chinaMatch[1]),
          benchmark: 0, // Would need additional parsing
          localPrice: 0,
          timestamp: new Date()
        }
      }

      if (indiaMatch) {
        data.india = {
          country: 'India',
          premium: parseFloat(indiaMatch[1]),
          benchmark: 0,
          localPrice: 0,
          timestamp: new Date()
        }
      }
    })

    // Also check tables
    $('table').each((_, table) => {
      const text = $(table).text().toLowerCase()
      if (text.includes('premium') || text.includes('discount')) {
        $(table).find('tr').each((_, row) => {
          const rowText = $(row).text().toLowerCase()
          const cells = $(row).find('td')

          if (rowText.includes('china') && cells.length >= 2) {
            const premiumText = $(cells[cells.length - 1]).text()
            const premium = parseFloat(premiumText.replace(/[^-0-9.]/g, ''))
            if (!isNaN(premium)) {
              data.china = {
                country: 'China',
                premium,
                benchmark: 0,
                localPrice: 0,
                timestamp: new Date()
              }
            }
          }

          if (rowText.includes('india') && cells.length >= 2) {
            const premiumText = $(cells[cells.length - 1]).text()
            const premium = parseFloat(premiumText.replace(/[^-0-9.]/g, ''))
            if (!isNaN(premium)) {
              data.india = {
                country: 'India',
                premium,
                benchmark: 0,
                localPrice: 0,
                timestamp: new Date()
              }
            }
          }
        })
      }
    })

    if (!data.china && !data.india) {
      return { ok: false, error: 'No premium data found on WGC' }
    }

    return { ok: true, data }
  } catch (e) {
    return { ok: false, error: String(e) }
  }
}

// Calculate Vietnam premium manually by comparing SJC to international price
export function calculateVietnamPremium(
  sjcPriceVND: number, // VND per tael (37.5g)
  xauusdPrice: number, // USD per troy ounce
  usdVndRate: number   // USD/VND exchange rate
): PremiumDiscount {
  const TAEL_TO_GRAM = 37.5
  const TROY_OUNCE_TO_GRAM = 31.1035

  // Convert international price to VND per tael
  const internationalPerGram = (xauusdPrice / TROY_OUNCE_TO_GRAM) * usdVndRate
  const internationalPerTael = internationalPerGram * TAEL_TO_GRAM

  // Calculate premium
  const premium = sjcPriceVND - internationalPerTael
  const premiumPercent = (premium / internationalPerTael) * 100

  return {
    country: 'Vietnam',
    premium: premiumPercent,
    benchmark: internationalPerTael,
    localPrice: sjcPriceVND,
    timestamp: new Date()
  }
}

export async function fetchAll(): Promise<FetchResult<WGCPremiumData>> {
  return fetchFromWGC()
}

if (import.meta.main) {
  console.log('Fetching premium/discount data...')
  const result = await fetchAll()
  if (result.ok) {
    console.log('Premium/Discount Data:')
    if (result.data.china) {
      console.log(`  China: ${result.data.china.premium > 0 ? '+' : ''}${result.data.china.premium.toFixed(2)}%`)
    }
    if (result.data.india) {
      console.log(`  India: ${result.data.india.premium > 0 ? '+' : ''}${result.data.india.premium.toFixed(2)}%`)
    }
  } else if (result.ok === false) {
    console.error('Error:', result.error)
  }

  // Example Vietnam premium calculation
  console.log('\nExample Vietnam Premium Calculation:')
  const vnPremium = calculateVietnamPremium(
    85_000_000, // 85 million VND per tael (example)
    2650,       // $2650/oz XAUUSD (example)
    25000       // 25,000 VND/USD (example)
  )
  console.log(`  Vietnam: ${vnPremium.premium > 0 ? '+' : ''}${vnPremium.premium.toFixed(2)}%`)
  console.log(`  International equiv: ${vnPremium.benchmark.toLocaleString()} VND/tael`)
  console.log(`  SJC price: ${vnPremium.localPrice.toLocaleString()} VND/tael`)
}
