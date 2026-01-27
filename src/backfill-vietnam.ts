// Backfill Vietnam history with international data and premiums

import { fetchVietnamHistory, type VietnamHistoricalPrice } from './sources/vietnam/history'
import { fetchHistory as fetchTwelveDataHistory } from './sources/twelvedata/index'
import { TAEL_GRAMS, TROY_OUNCE_GRAMS, DEFAULT_HISTORICAL_EXCHANGE_RATE } from './constants'

const STORAGE_FILE = 'data/vietnam-history.json'

interface DailySnapshot {
  date: string
  timestamp: string
  sjcMieng?: {
    buy: number
    sell: number
  }
  sjcNhan?: {
    buy: number
    sell: number
  }
  international: {
    usdPerOunce: number
    vndPerTael: number
  }
  exchangeRate: number
  premium: number
}

interface StoredData {
  lastUpdated: string
  snapshots: DailySnapshot[]
}

interface IntlPrice {
  usdPerOunce: number
  usdPerGram: number
}

async function loadExisting(): Promise<StoredData> {
  const file = Bun.file(STORAGE_FILE)
  if (await file.exists()) {
    return await file.json()
  }
  return { lastUpdated: '', snapshots: [] }
}

/**
 * Build a daily snapshot from Vietnam and international prices
 */
function buildSnapshot(
  vn: VietnamHistoricalPrice,
  intl: IntlPrice,
  exchangeRate: number
): DailySnapshot {
  const intlVndPerTael = intl.usdPerGram * exchangeRate * TAEL_GRAMS
  const premium = ((vn.sellPrice - intlVndPerTael) / intlVndPerTael) * 100

  return {
    date: vn.date,
    timestamp: `${vn.date}T00:00:00.000Z`,
    sjcMieng: {
      buy: vn.buyPrice,
      sell: vn.sellPrice
    },
    international: {
      usdPerOunce: intl.usdPerOunce,
      vndPerTael: intlVndPerTael
    },
    exchangeRate,
    premium
  }
}

/**
 * Find a nearby date in the map (for matching weekends to nearest trading day)
 */
function findNearbyDate(map: Map<string, IntlPrice>, targetDate: string): string | null {
  const target = new Date(targetDate)

  // Try up to 3 days before/after
  for (let offset = 1; offset <= 3; offset++) {
    const before = new Date(target)
    before.setDate(before.getDate() - offset)
    const beforeStr = before.toISOString().split('T')[0]
    if (map.has(beforeStr)) return beforeStr

    const after = new Date(target)
    after.setDate(after.getDate() + offset)
    const afterStr = after.toISOString().split('T')[0]
    if (map.has(afterStr)) return afterStr
  }

  return null
}

async function main(): Promise<void> {
  console.log('Backfilling Vietnam history...\n')

  // Fetch Vietnam historical data
  console.log('1. Fetching Vietnam SJC history from webgia.com...')
  const vnResult = await fetchVietnamHistory('1year')
  if (vnResult.ok === false) {
    console.error('Failed to fetch Vietnam history:', vnResult.error)
    process.exit(1)
  }
  console.log(`   Got ${vnResult.data.data.length} Vietnam data points`)

  // Fetch international historical data for the same period
  console.log('\n2. Fetching international history from TwelveData...')
  const intlResult = await fetchTwelveDataHistory(400) // ~1 year + buffer
  if (intlResult.ok === false) {
    console.error('Failed to fetch international history:', intlResult.error)
    process.exit(1)
  }
  console.log(`   Got ${intlResult.data.data.length} international data points`)

  // Create lookup map for international prices by date
  const intlByDate = new Map<string, IntlPrice>()
  for (const p of intlResult.data.data) {
    intlByDate.set(p.date, {
      usdPerOunce: p.pricePerOunce ?? (p.pricePerGram * TROY_OUNCE_GRAMS),
      usdPerGram: p.pricePerGram
    })
  }

  // Exchange rate for historical data
  // Note: This is an approximation. Historical premiums may differ from actual values.
  // Override via HISTORICAL_EXCHANGE_RATE env var if needed.
  const exchangeRate = parseInt(process.env.HISTORICAL_EXCHANGE_RATE ?? '') || DEFAULT_HISTORICAL_EXCHANGE_RATE
  console.log(`\n   Using exchange rate: ${exchangeRate} VND/USD (approximate)`)

  // Build snapshots
  console.log('\n3. Building snapshots...')
  const snapshots: DailySnapshot[] = []
  let matched = 0
  let unmatched = 0

  for (const vn of vnResult.data.data) {
    let intl = intlByDate.get(vn.date)

    // Try nearby dates if exact match not found (weekends)
    if (!intl) {
      const nearbyDate = findNearbyDate(intlByDate, vn.date)
      if (nearbyDate) {
        intl = intlByDate.get(nearbyDate)
      }
    }

    if (intl) {
      snapshots.push(buildSnapshot(vn, intl, exchangeRate))
      matched++
    } else {
      unmatched++
    }
  }

  console.log(`   Matched: ${matched}, Unmatched: ${unmatched}`)

  // Load existing and merge
  const existing = await loadExisting()
  const existingDates = new Set(existing.snapshots.map(s => s.date))

  // Add backfilled data (don't overwrite existing)
  let added = 0
  for (const snapshot of snapshots) {
    if (!existingDates.has(snapshot.date)) {
      existing.snapshots.push(snapshot)
      added++
    }
  }

  // Sort by date
  existing.snapshots.sort((a, b) => a.date.localeCompare(b.date))
  existing.lastUpdated = new Date().toISOString()

  // Save
  await Bun.write(STORAGE_FILE, JSON.stringify(existing, null, 2))

  console.log(`\n✓ Backfill complete!`)
  console.log(`  Added: ${added} new snapshots`)
  console.log(`  Total: ${existing.snapshots.length} snapshots`)
  console.log(`  Period: ${existing.snapshots[0]?.date} to ${existing.snapshots.at(-1)?.date}`)

  // Premium statistics
  const premiums = existing.snapshots.map(s => s.premium).filter(p => p > 0)
  if (premiums.length > 0) {
    const avgPremium = premiums.reduce((a, b) => a + b, 0) / premiums.length
    const minPremium = Math.min(...premiums)
    const maxPremium = Math.max(...premiums)

    console.log(`\n📊 Premium Statistics:`)
    console.log(`   Average: ${avgPremium.toFixed(2)}%`)
    console.log(`   Min: ${minPremium.toFixed(2)}%`)
    console.log(`   Max: ${maxPremium.toFixed(2)}%`)
  }
}

main().catch(console.error)
