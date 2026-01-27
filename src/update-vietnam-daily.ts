// Daily Vietnam price update using VNAppMob API
// Run this daily to capture current SJC prices and add to history

import { fetchCurrent } from './sources/vnappmob/index'
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

async function loadExisting(): Promise<StoredData> {
  const file = Bun.file(STORAGE_FILE)
  if (await file.exists()) {
    return await file.json()
  }
  return { lastUpdated: '', snapshots: [] }
}

async function main(): Promise<void> {
  console.log('Updating Vietnam daily price...\n')

  // Get today's date
  const today = new Date().toISOString().split('T')[0]

  // Load existing data
  const existing = await loadExisting()
  const existingDates = new Set(existing.snapshots.map(s => s.date))

  // Check if today already exists
  if (existingDates.has(today)) {
    console.log(`Data for ${today} already exists. Skipping.`)
    return
  }

  // Fetch current Vietnam price from VNAppMob
  console.log('1. Fetching current SJC price from VNAppMob...')
  const vnResult = await fetchCurrent()
  if (vnResult.ok === false) {
    console.error('Failed to fetch Vietnam price:', vnResult.error)
    process.exit(1)
  }

  const vnPrice = vnResult.data
  console.log(`   Buy:  ${vnPrice.buyPrice.toLocaleString()} VND/tael`)
  console.log(`   Sell: ${vnPrice.sellPrice.toLocaleString()} VND/tael`)

  // Fetch current international price
  console.log('\n2. Fetching international price from TwelveData...')
  const intlResult = await fetchTwelveDataHistory(5) // Just need recent data
  if (intlResult.ok === false) {
    console.error('Failed to fetch international price:', intlResult.error)
    process.exit(1)
  }

  // Get latest international price
  const intlLatest = intlResult.data.data.at(-1)
  if (!intlLatest) {
    console.error('No international data available')
    process.exit(1)
  }

  console.log(`   USD/oz: ${intlLatest.pricePerOunce?.toFixed(2)}`)

  // Calculate premium
  const exchangeRate = parseInt(process.env.HISTORICAL_EXCHANGE_RATE ?? '') || DEFAULT_HISTORICAL_EXCHANGE_RATE
  const usdPerOunce = intlLatest.pricePerOunce ?? (intlLatest.pricePerGram * TROY_OUNCE_GRAMS)
  const usdPerGram = intlLatest.pricePerGram
  const intlVndPerTael = usdPerGram * exchangeRate * TAEL_GRAMS
  const premium = ((vnPrice.sellPrice - intlVndPerTael) / intlVndPerTael) * 100

  console.log(`\n3. Building snapshot for ${today}...`)
  console.log(`   Exchange rate: ${exchangeRate} VND/USD`)
  console.log(`   Premium: ${premium.toFixed(2)}%`)

  // Create snapshot
  const snapshot: DailySnapshot = {
    date: today,
    timestamp: `${today}T00:00:00.000Z`,
    sjcMieng: {
      buy: vnPrice.buyPrice,
      sell: vnPrice.sellPrice
    },
    international: {
      usdPerOunce,
      vndPerTael: intlVndPerTael
    },
    exchangeRate,
    premium
  }

  // Add to existing data
  existing.snapshots.push(snapshot)
  existing.snapshots.sort((a, b) => a.date.localeCompare(b.date))
  existing.lastUpdated = new Date().toISOString()

  // Save
  await Bun.write(STORAGE_FILE, JSON.stringify(existing, null, 2))

  console.log(`\n✓ Added ${today} to vietnam-history.json`)
  console.log(`  Total snapshots: ${existing.snapshots.length}`)
}

main().catch(console.error)
