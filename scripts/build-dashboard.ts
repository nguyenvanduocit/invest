// Compose data/dashboard-data.json from the various JSON outputs.
// Usage: bun run scripts/build-dashboard.ts

import { readFileSync, writeFileSync } from 'fs'

const read = (p: string) => JSON.parse(readFileSync(p, 'utf-8'))

const latest = read('data/latest.json')
const suggestion = read('data/ai-suggestion.json')
const drawdowns = read('data/drawdowns.json')
const fp = read('data/first-principles.json')
const hist5y = read('data/history-5y.json')
const vnHist = read('data/vietnam-history-1y.json')
const vnSnap = read('data/vietnam-history.json')

// 5y XAUUSD series -> compact { d, u }
const intlSeries = hist5y.data.map((p: any) => ({ d: p.date, u: p.usdPerOunce }))

// 1y Vietnam SJC series -> compact { d, s }
const vnSeries = vnHist.data.map((p: any) => ({ d: p.date, s: p.sellPrice }))

// Daily snapshots -> { d, sjc, intl, prem }
const vnSnapshots = vnSnap.snapshots
  .filter((s: any) => s.sjcMieng && s.international)
  .map((s: any) => ({
    d: s.date,
    sjc: s.sjcMieng?.sell ?? null,
    intl: s.international?.vndPerTael ?? null,
    prem: s.premium ?? null,
  }))

// Slim first-principles factors (drop noisy `recent` arrays)
const fpSlim = {
  fetchedAt: fp.fetchedAt,
  factors: fp.factors.map((f: any) => ({
    id: f.id,
    name: f.name,
    source: f.source,
    unit: f.unit,
    relationToGold: f.relationToGold,
    latest: f.latest,
    change1dPct: f.change1dPct,
    change5dPct: f.change5dPct,
    change20dPct: f.change20dPct,
  })),
}

const out = {
  latest,
  suggestion,
  drawdowns,
  fp: fpSlim,
  intlSeries,
  vnSeries,
  vnSnapshots,
}

writeFileSync('data/dashboard-data.json', JSON.stringify(out))
console.log('Wrote data/dashboard-data.json')
console.log('  intlSeries:', intlSeries.length)
console.log('  vnSeries:', vnSeries.length)
console.log('  vnSnapshots:', vnSnapshots.length)
console.log('  fp factors:', fpSlim.factors.length)
