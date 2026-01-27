// Analyze historical gold price drawdowns and recovery times

interface HistoricalPoint {
  date: string
  usdPerOunce: number
}

interface Drawdown {
  peakDate: string
  peakPrice: number
  troughDate: string
  troughPrice: number
  drawdownPct: number
  recoveryDate: string | null
  daysToTrough: number
  daysToRecovery: number | null
  recovered: boolean
}

function daysBetween(date1: string, date2: string): number {
  const d1 = new Date(date1)
  const d2 = new Date(date2)
  return Math.round((d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24))
}

function findDrawdowns(data: HistoricalPoint[], minDrawdownPct: number = 10): Drawdown[] {
  const drawdowns: Drawdown[] = []
  let i = 0

  while (i < data.length - 1) {
    // Find local peak: price higher than next N days
    let isPeak = true
    const lookAhead = Math.min(20, data.length - i - 1)

    for (let j = 1; j <= lookAhead; j++) {
      if (data[i + j].usdPerOunce > data[i].usdPerOunce) {
        isPeak = false
        break
      }
    }

    if (!isPeak) {
      i++
      continue
    }

    const peak = data[i]
    let trough = peak
    let troughIdx = i
    let recoveryIdx: number | null = null

    // Find trough and recovery
    for (let j = i + 1; j < data.length; j++) {
      const current = data[j]

      // Update trough if lower
      if (current.usdPerOunce < trough.usdPerOunce) {
        trough = current
        troughIdx = j
        recoveryIdx = null // Reset recovery since we found new trough
      }

      // Check for recovery (price returns to peak level)
      if (current.usdPerOunce >= peak.usdPerOunce && recoveryIdx === null && j > troughIdx) {
        recoveryIdx = j
        break
      }
    }

    const drawdownPct = ((peak.usdPerOunce - trough.usdPerOunce) / peak.usdPerOunce) * 100

    // Only include significant drawdowns
    if (drawdownPct >= minDrawdownPct) {
      const recovery = recoveryIdx !== null ? data[recoveryIdx] : null

      drawdowns.push({
        peakDate: peak.date,
        peakPrice: peak.usdPerOunce,
        troughDate: trough.date,
        troughPrice: trough.usdPerOunce,
        drawdownPct,
        recoveryDate: recovery?.date ?? null,
        daysToTrough: daysBetween(peak.date, trough.date),
        daysToRecovery: recovery ? daysBetween(peak.date, recovery.date) : null,
        recovered: recoveryIdx !== null
      })

      // Skip to after recovery or trough
      i = recoveryIdx ?? troughIdx
    }

    i++
  }

  return drawdowns
}

function formatDuration(days: number): string {
  const years = Math.floor(days / 365)
  const months = Math.floor((days % 365) / 30)
  const remainingDays = days % 30

  const parts: string[] = []
  if (years > 0) parts.push(`${years}y`)
  if (months > 0) parts.push(`${months}m`)
  if (remainingDays > 0 && years === 0) parts.push(`${remainingDays}d`)

  return parts.join(' ') || '0d'
}

async function main(): Promise<void> {
  const minDrawdown = parseFloat(process.argv[2] ?? '10')
  const dataFile = process.argv[3] ?? 'data/history-19y.json'

  console.log(`Loading data from ${dataFile}...`)

  const file = Bun.file(dataFile)
  if (!await file.exists()) {
    console.error(`File not found: ${dataFile}`)
    console.error('Run: bun run fetch:history 19')
    process.exit(1)
  }

  const json = await file.json()
  const data: HistoricalPoint[] = json.data

  console.log(`Analyzing ${data.length} data points (${data[0].date} to ${data.at(-1)?.date})`)
  console.log(`Minimum drawdown threshold: ${minDrawdown}%\n`)

  const drawdowns = findDrawdowns(data, minDrawdown)

  console.log('='.repeat(100))
  console.log('GOLD PRICE DRAWDOWNS & RECOVERY ANALYSIS')
  console.log('='.repeat(100))

  if (drawdowns.length === 0) {
    console.log(`\nNo drawdowns >= ${minDrawdown}% found in this period.`)
    return
  }

  // Sort by drawdown severity
  const sorted = [...drawdowns].sort((a, b) => b.drawdownPct - a.drawdownPct)

  console.log(`\nFound ${drawdowns.length} significant drawdowns (>= ${minDrawdown}%):\n`)

  console.log('┌─────────────┬─────────────┬─────────────┬───────────┬─────────────┬─────────────┬─────────────┐')
  console.log('│ Peak Date   │ Peak Price  │ Trough Date │ Drawdown  │ To Trough   │ Recovery    │ To Recovery │')
  console.log('├─────────────┼─────────────┼─────────────┼───────────┼─────────────┼─────────────┼─────────────┤')

  for (const dd of sorted) {
    const peak = `$${dd.peakPrice.toFixed(0).padStart(5)}`
    const drawdown = `-${dd.drawdownPct.toFixed(1)}%`.padStart(8)
    const toTrough = formatDuration(dd.daysToTrough).padStart(10)
    const recovery = dd.recoveryDate ?? 'Not yet'
    const toRecovery = dd.daysToRecovery
      ? formatDuration(dd.daysToRecovery).padStart(10)
      : 'Ongoing'.padStart(10)

    console.log(
      `│ ${dd.peakDate} │ ${peak.padStart(10)} │ ${dd.troughDate} │ ${drawdown} │ ${toTrough} │ ${recovery.padStart(11)} │ ${toRecovery} │`
    )
  }

  console.log('└─────────────┴─────────────┴─────────────┴───────────┴─────────────┴─────────────┴─────────────┘')

  // Summary statistics
  const recovered = drawdowns.filter(d => d.recovered)
  const avgRecoveryDays = recovered.length > 0
    ? recovered.reduce((sum, d) => sum + (d.daysToRecovery ?? 0), 0) / recovered.length
    : 0

  const maxDrawdown = sorted[0]
  const longestRecovery = recovered.length > 0
    ? recovered.reduce((max, d) => (d.daysToRecovery ?? 0) > (max.daysToRecovery ?? 0) ? d : max)
    : null

  console.log('\n📊 SUMMARY')
  console.log('-'.repeat(50))
  console.log(`Total significant drawdowns: ${drawdowns.length}`)
  console.log(`Recovered: ${recovered.length} | Still underwater: ${drawdowns.length - recovered.length}`)
  console.log(`\nWorst drawdown: -${maxDrawdown.drawdownPct.toFixed(1)}% (${maxDrawdown.peakDate} → ${maxDrawdown.troughDate})`)

  if (longestRecovery) {
    console.log(`Longest recovery: ${formatDuration(longestRecovery.daysToRecovery!)} (${longestRecovery.peakDate} peak)`)
  }

  if (recovered.length > 0) {
    console.log(`Average recovery time: ${formatDuration(Math.round(avgRecoveryDays))}`)
  }

  // Key insight
  console.log('\n💡 KEY INSIGHT')
  console.log('-'.repeat(50))

  const notRecovered = drawdowns.filter(d => !d.recovered)
  if (notRecovered.length > 0) {
    console.log(`⚠️  ${notRecovered.length} drawdown(s) have NOT recovered yet!`)
    for (const dd of notRecovered) {
      const waitingDays = daysBetween(dd.peakDate, data.at(-1)!.date)
      console.log(`   Peak ${dd.peakDate} ($${dd.peakPrice.toFixed(0)}) - waiting ${formatDuration(waitingDays)}`)
    }
  } else {
    console.log('✅ All historical drawdowns have recovered.')
    console.log(`   But recovery can take up to ${formatDuration(longestRecovery?.daysToRecovery ?? 0)}!`)
  }

  // Save results
  const output = {
    analyzedAt: new Date().toISOString(),
    dataFile,
    minDrawdownPct: minDrawdown,
    period: { start: data[0].date, end: data.at(-1)?.date },
    summary: {
      totalDrawdowns: drawdowns.length,
      recovered: recovered.length,
      notRecovered: drawdowns.length - recovered.length,
      worstDrawdownPct: maxDrawdown.drawdownPct,
      longestRecoveryDays: longestRecovery?.daysToRecovery ?? null,
      avgRecoveryDays: Math.round(avgRecoveryDays)
    },
    drawdowns: sorted
  }

  await Bun.write('data/drawdowns.json', JSON.stringify(output, null, 2))
  console.log('\nSaved to data/drawdowns.json')
}

main().catch(console.error)
