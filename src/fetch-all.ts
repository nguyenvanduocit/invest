import { fetchAll as fetchVietnam } from './sources/vietnam/index'
import { fetchAll as fetchInternational } from './sources/international/index'
import { fetchAll as fetchChina } from './sources/china/index'
import { fetchAll as fetchRussia } from './sources/russia/index'
import { fetchAll as fetchIndia } from './sources/india/index'
import { fetchAllRates } from './sources/exchange-rate/index'
import { calculateVietnamPremium } from './sources/premium/index'
import type { GoldPrice, FetchResult } from './types'

const TAEL_GRAMS = 37.5

interface NormalizedPrice {
  source: string
  country: string
  originalCurrency: string
  originalPricePerGram: number
  vndPerGram: number
  vndPerTael: number
}

interface AllPrices {
  normalized: NormalizedPrice[]  // All prices in VND for comparison
  raw: {
    vietnam: GoldPrice[]
    international: GoldPrice[]
    china: GoldPrice[]
    russia: GoldPrice[]
    india: GoldPrice[]
  }
  exchangeRates: Record<string, number>
  vietnamPremium?: {
    premiumPercent: number
    benchmarkVND: number
    localPriceVND: number
  }
}

function dedupeBySource(prices: GoldPrice[]): GoldPrice[] {
  const seen = new Map<string, GoldPrice>()
  for (const p of prices) {
    const existing = seen.get(p.source)
    if (!existing || (p.sellPrice && !existing.sellPrice)) {
      seen.set(p.source, p)
    }
  }
  return Array.from(seen.values())
}

function normalizeToVND(
  prices: GoldPrice[],
  rates: Record<string, number>
): NormalizedPrice[] {
  const vndRate = rates['VND'] || 1

  return prices.map(p => {
    let pricePerGram = p.pricePerGram || 0

    // If we have tael price but not gram, convert
    if (!pricePerGram && p.pricePerTael) {
      pricePerGram = p.pricePerTael / TAEL_GRAMS
    }
    // If we have sell price (Vietnam), use it
    if (!pricePerGram && p.sellPrice) {
      pricePerGram = p.sellPrice / TAEL_GRAMS
    }

    // Convert to VND
    let vndPerGram: number
    if (p.currency === 'VND') {
      vndPerGram = pricePerGram
    } else if (p.currency === 'USD') {
      vndPerGram = pricePerGram * vndRate
    } else {
      // Convert other currencies: first to USD, then to VND
      const currencyRate = rates[p.currency]
      if (currencyRate) {
        // currencyRate is X per 1 USD, so price in USD = price / currencyRate
        const priceInUSD = pricePerGram / currencyRate
        vndPerGram = priceInUSD * vndRate
      } else {
        vndPerGram = pricePerGram // Fallback
      }
    }

    return {
      source: p.source,
      country: p.country,
      originalCurrency: p.currency,
      originalPricePerGram: pricePerGram,
      vndPerGram,
      vndPerTael: vndPerGram * TAEL_GRAMS
    }
  })
}

async function fetchAllPrices(): Promise<FetchResult<AllPrices>> {
  console.log('Fetching all gold prices...\n')

  // Fetch exchange rates first
  const ratesResult = await fetchAllRates()
  if (!ratesResult.ok) {
    return { ok: false, error: `Exchange rates: ${ratesResult.error}` }
  }
  const rates = ratesResult.data

  // Fetch international first to use for fallbacks
  const internationalResult = await fetchInternational()
  const xauusdPrice = internationalResult.ok ? internationalResult.data[0]?.pricePerOunce : undefined

  const [vietnamResult, chinaResult, russiaResult, indiaResult] = await Promise.all([
    fetchVietnam(),
    fetchChina(xauusdPrice),
    fetchRussia(xauusdPrice),
    fetchIndia()
  ])

  const raw = {
    vietnam: [] as GoldPrice[],
    international: [] as GoldPrice[],
    china: [] as GoldPrice[],
    russia: [] as GoldPrice[],
    india: [] as GoldPrice[]
  }

  const errors: string[] = []

  // Process Vietnam
  if (vietnamResult.ok) {
    const unique = new Map<number, GoldPrice>()
    for (const p of vietnamResult.data) {
      const key = p.sellPrice || p.pricePerTael || 0
      if (!unique.has(key)) unique.set(key, p)
    }
    raw.vietnam = Array.from(unique.values())
  } else {
    errors.push(`Vietnam: ${vietnamResult.error}`)
  }

  if (internationalResult.ok) raw.international = internationalResult.data
  else errors.push(`International: ${internationalResult.error}`)

  if (chinaResult.ok) raw.china = dedupeBySource(chinaResult.data)
  else errors.push(`China: ${chinaResult.error}`)

  if (russiaResult.ok) raw.russia = dedupeBySource(russiaResult.data)
  else errors.push(`Russia: ${russiaResult.error}`)

  if (indiaResult.ok) {
    raw.india = indiaResult.data
      .filter(p => p.source.toLowerCase().includes('gold 999'))
      .slice(0, 1)
  } else {
    errors.push(`India: ${indiaResult.error}`)
  }

  if (errors.length > 0) {
    console.log('Warnings:', errors.join('; '))
  }

  // Normalize all prices to VND
  const allPrices = [
    ...raw.international,
    ...raw.vietnam,
    ...raw.china,
    ...raw.russia,
    ...raw.india
  ]
  const normalized = normalizeToVND(allPrices, rates)

  // Calculate Vietnam premium
  let vietnamPremium: AllPrices['vietnamPremium']
  const sjcPrice = raw.vietnam.find(p => p.source.toLowerCase().includes('sjc'))
  const xauusd = raw.international[0]

  if (sjcPrice?.sellPrice && xauusd?.pricePerOunce) {
    const premium = calculateVietnamPremium(
      sjcPrice.sellPrice,
      xauusd.pricePerOunce,
      rates['VND']
    )
    vietnamPremium = {
      premiumPercent: premium.premium,
      benchmarkVND: premium.benchmark,
      localPriceVND: premium.localPrice
    }
  }

  return {
    ok: true,
    data: {
      normalized,
      raw,
      exchangeRates: rates,
      vietnamPremium
    }
  }
}

async function main() {
  const result = await fetchAllPrices()

  if (!result.ok) {
    console.error('Failed to fetch prices:', result.error)
    process.exit(1)
  }

  const { data } = result

  console.log('='.repeat(70))
  console.log('GOLD PRICE COMPARISON (All in VND)')
  console.log('='.repeat(70))

  // Sort by VND price for comparison
  const sorted = [...data.normalized].sort((a, b) => a.vndPerGram - b.vndPerGram)

  // Find benchmark (international)
  const benchmark = sorted.find(p => p.country === 'International')
  const benchmarkVND = benchmark?.vndPerGram || 0

  console.log('\n📊 PRICES PER GRAM (sorted low to high)')
  console.log('-'.repeat(70))
  console.log(
    'Country'.padEnd(15) +
    'Source'.padEnd(30) +
    'VND/g'.padStart(15) +
    'vs Intl'.padStart(10)
  )
  console.log('-'.repeat(70))

  for (const p of sorted) {
    const diff = benchmarkVND > 0 ? ((p.vndPerGram - benchmarkVND) / benchmarkVND * 100) : 0
    const diffStr = diff === 0 ? '(base)' : `${diff > 0 ? '+' : ''}${diff.toFixed(1)}%`

    console.log(
      p.country.padEnd(15) +
      p.source.slice(0, 28).padEnd(30) +
      p.vndPerGram.toLocaleString(undefined, { maximumFractionDigits: 0 }).padStart(15) +
      diffStr.padStart(10)
    )
  }

  console.log('\n📊 PRICES PER TAEL (1 lượng = 37.5g)')
  console.log('-'.repeat(70))
  console.log(
    'Country'.padEnd(15) +
    'VND/tael'.padStart(20) +
    'Original'.padStart(35)
  )
  console.log('-'.repeat(70))

  for (const p of sorted) {
    const original = `${p.originalPricePerGram.toLocaleString(undefined, { maximumFractionDigits: 0 })} ${p.originalCurrency}/g`
    console.log(
      p.country.padEnd(15) +
      p.vndPerTael.toLocaleString(undefined, { maximumFractionDigits: 0 }).padStart(20) +
      original.padStart(35)
    )
  }

  // Vietnam premium summary
  if (data.vietnamPremium) {
    console.log('\n📈 VIETNAM PREMIUM ANALYSIS')
    console.log('-'.repeat(70))
    const sign = data.vietnamPremium.premiumPercent > 0 ? '+' : ''
    console.log(`   SJC vs International: ${sign}${data.vietnamPremium.premiumPercent.toFixed(2)}%`)
    console.log(`   International (converted): ${data.vietnamPremium.benchmarkVND.toLocaleString(undefined, { maximumFractionDigits: 0 })} VND/tael`)
    console.log(`   SJC actual:                ${data.vietnamPremium.localPriceVND.toLocaleString(undefined, { maximumFractionDigits: 0 })} VND/tael`)
  }

  // Exchange rates
  console.log('\n💱 EXCHANGE RATES (vs USD)')
  console.log('-'.repeat(70))
  for (const [currency, rate] of Object.entries(data.exchangeRates)) {
    if (currency !== 'USD') {
      console.log(`   ${currency}: ${rate.toLocaleString(undefined, { maximumFractionDigits: 2 })}`)
    }
  }

  console.log('\n' + '='.repeat(70))
  console.log(`Last updated: ${new Date().toISOString()}`)

  // Save to file
  const jsonOutput = {
    timestamp: new Date().toISOString(),
    normalized: data.normalized,
    raw: data.raw,
    exchangeRates: data.exchangeRates,
    vietnamPremium: data.vietnamPremium
  }

  await Bun.write('data/latest.json', JSON.stringify(jsonOutput, null, 2))
  console.log('\nSaved to data/latest.json')
}

main().catch(console.error)
