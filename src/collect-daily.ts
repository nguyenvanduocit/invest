// Collect and store daily snapshot
// Run this daily via cron to build up Vietnam historical data

import { fetchAll as fetchVietnam } from './sources/vietnam/index'
import { fetchAll as fetchInternational } from './sources/international/index'
import { fetchAllRates } from './sources/exchange-rate/index'

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

async function loadExisting(): Promise<StoredData> {
  const file = Bun.file(STORAGE_FILE)
  if (await file.exists()) {
    return await file.json()
  }
  return { lastUpdated: '', snapshots: [] }
}

async function collectSnapshot(): Promise<DailySnapshot | null> {
  const today = new Date().toISOString().split('T')[0]

  // Fetch all data
  const [vnResult, intlResult, ratesResult] = await Promise.all([
    fetchVietnam(),
    fetchInternational(),
    fetchAllRates()
  ])

  if (!intlResult.ok || !ratesResult.ok) {
    console.error('Failed to fetch required data')
    return null
  }

  const vndRate = ratesResult.data['VND'] || 25000
  const intl = intlResult.data[0]
  const intlVndPerTael = (intl.pricePerOunce! / 31.1035) * vndRate * 37.5

  const snapshot: DailySnapshot = {
    date: today,
    timestamp: new Date().toISOString(),
    international: {
      usdPerOunce: intl.pricePerOunce!,
      vndPerTael: intlVndPerTael
    },
    exchangeRate: vndRate,
    premium: 0
  }

  // Vietnam data
  if (vnResult.ok) {
    const mieng = vnResult.data.find(p => p.source.includes('Miếng'))
    const nhan = vnResult.data.find(p => p.source.includes('Nhẫn'))

    if (mieng) {
      snapshot.sjcMieng = {
        buy: mieng.buyPrice!,
        sell: mieng.sellPrice!
      }
      snapshot.premium = ((mieng.sellPrice! - intlVndPerTael) / intlVndPerTael) * 100
    }

    if (nhan) {
      snapshot.sjcNhan = {
        buy: nhan.buyPrice!,
        sell: nhan.sellPrice!
      }
    }
  }

  return snapshot
}

async function main() {
  console.log('Collecting daily snapshot...')

  const existing = await loadExisting()
  const today = new Date().toISOString().split('T')[0]

  // Check if already collected today
  const alreadyHasToday = existing.snapshots.some(s => s.date === today)
  if (alreadyHasToday) {
    console.log(`Already have data for ${today}`)

    // Option to force update with --force
    if (!process.argv.includes('--force')) {
      console.log('Use --force to overwrite')
      return
    }
    console.log('Force updating...')
    existing.snapshots = existing.snapshots.filter(s => s.date !== today)
  }

  const snapshot = await collectSnapshot()
  if (!snapshot) {
    console.error('Failed to collect snapshot')
    process.exit(1)
  }

  existing.snapshots.push(snapshot)
  existing.snapshots.sort((a, b) => a.date.localeCompare(b.date))
  existing.lastUpdated = new Date().toISOString()

  await Bun.write(STORAGE_FILE, JSON.stringify(existing, null, 2))

  console.log(`\n✓ Saved snapshot for ${today}`)
  console.log(`  SJC Miếng: ${snapshot.sjcMieng?.sell?.toLocaleString() || 'N/A'} VND`)
  console.log(`  International: ${snapshot.international.vndPerTael.toLocaleString()} VND`)
  console.log(`  Premium: ${snapshot.premium.toFixed(2)}%`)
  console.log(`  Total snapshots: ${existing.snapshots.length}`)

  // Show recent history
  console.log('\nRecent history:')
  const recent = existing.snapshots.slice(-7)
  for (const s of recent) {
    const sjc = s.sjcMieng?.sell ? (s.sjcMieng.sell / 1_000_000).toFixed(1) + 'M' : 'N/A'
    const intl = (s.international.vndPerTael / 1_000_000).toFixed(1) + 'M'
    console.log(`  ${s.date}: SJC=${sjc} | Intl=${intl} | Premium=${s.premium.toFixed(1)}%`)
  }
}

main().catch(console.error)
