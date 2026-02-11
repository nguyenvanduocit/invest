import { fetchFirstPrinciplesData } from './sources/first-principles/index'

const OUTPUT_FILE = 'data/first-principles.json'

function formatChange(value: number | null): string {
  if (value === null || Number.isNaN(value)) return 'n/a'
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`
}

async function main() {
  const strict = process.argv.includes('--strict')

  console.log('Fetching first-principles gold context...')
  const data = await fetchFirstPrinciplesData()

  await Bun.write(OUTPUT_FILE, JSON.stringify(data, null, 2))

  console.log(`Saved ${OUTPUT_FILE}`)
  console.log(`  fetchedAt: ${data.fetchedAt}`)
  console.log('')
  console.log('Factor snapshot:')

  for (const factor of data.factors) {
    const latest = factor.latest
      ? `${factor.latest.value.toLocaleString(undefined, { maximumFractionDigits: 3 })} ${factor.unit} (${factor.latest.date})`
      : 'unavailable'

    console.log(
      `  - ${factor.name}: ${latest}` +
      ` | 1d ${formatChange(factor.change1dPct)} | 5d ${formatChange(factor.change5dPct)} | 20d ${formatChange(factor.change20dPct)}`
    )
  }

  console.log('')
  console.log('Coverage:')
  console.log(`  - Required factors: ${data.coverage.availableFactors}/${data.coverage.requiredFactors}`)
  console.log(`  - Policy statements: ${data.coverage.policyCount}`)
  console.log(`  - Geopolitical events: ${data.coverage.geopoliticalCount}`)
  console.log(`  - Country actions: ${data.coverage.countryActionCount}`)
  console.log(`  - Dollar/yield drivers: ${data.coverage.dollarYieldCount}`)
  console.log(`  - Healthy: ${data.coverage.healthy ? 'YES' : 'NO'}`)

  if (data.coverage.missingFactors.length > 0) {
    console.log(`  - Missing factors: ${data.coverage.missingFactors.join(', ')}`)
  }

  if (data.coverage.staleFactors.length > 0) {
    console.log(`  - Stale factors: ${data.coverage.staleFactors.join(', ')}`)
  }

  if (data.coverage.sourceFailures.length > 0) {
    console.log('  - Source failures:')
    for (const failure of data.coverage.sourceFailures) {
      console.log(`    * ${failure.id}: ${failure.error}`)
    }
  }

  if (strict && !data.coverage.healthy) {
    console.error('Strict mode failed: first-principles coverage is not healthy')
    process.exit(1)
  }
}

main().catch(error => {
  console.error('Failed to fetch first-principles context:', error)
  process.exit(1)
})
