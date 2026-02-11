import { assessCoverage, type FirstPrinciplesData } from './sources/first-principles/index'

const INPUT_FILE = 'data/first-principles.json'
const OUTPUT_FILE = 'data/first-principles-coverage.json'

interface VerificationReport {
  checkedAt: string
  sourceFile: string
  dataFetchedAt: string
  ageMinutes: number
  thresholds: {
    maxAgeMinutes: number
    minNewsPerCategory: number
  }
  coverage: ReturnType<typeof assessCoverage>
  hardFailures: string[]
  warnings: string[]
  canProceedToIntegration: boolean
}

async function main() {
  const strict = process.argv.includes('--strict')
  const maxAgeMinutes = Number(process.env.FIRST_PRINCIPLES_MAX_AGE_MINUTES || 360)

  const file = Bun.file(INPUT_FILE)
  if (!await file.exists()) {
    console.error(`Missing ${INPUT_FILE}. Run: bun run src/fetch-first-principles.ts`)
    process.exit(1)
  }

  const payload = await file.json() as FirstPrinciplesData
  const coverage = assessCoverage(payload)
  const fetchedAt = new Date(payload.fetchedAt)
  const now = new Date()
  const ageMinutes = Math.round((now.getTime() - fetchedAt.getTime()) / 60000)

  const hardFailures: string[] = []
  const warnings: string[] = []

  if (Number.isNaN(fetchedAt.getTime())) {
    hardFailures.push('Invalid fetchedAt timestamp in first-principles data')
  }

  if (ageMinutes > maxAgeMinutes) {
    hardFailures.push(`Data is stale (${ageMinutes} minutes old, max ${maxAgeMinutes})`)
  }

  if (coverage.missingFactors.length > 0) {
    hardFailures.push(`Missing required factors: ${coverage.missingFactors.join(', ')}`)
  }

  if (coverage.staleFactors.length > 0) {
    warnings.push(`Stale factors: ${coverage.staleFactors.join(', ')}`)
  }

  if (coverage.policyCount < coverage.minNewsRequired) {
    hardFailures.push(`Not enough policy statements (${coverage.policyCount}/${coverage.minNewsRequired})`)
  }

  if (coverage.geopoliticalCount < coverage.minNewsRequired) {
    hardFailures.push(`Not enough geopolitical events (${coverage.geopoliticalCount}/${coverage.minNewsRequired})`)
  }

  if (coverage.countryActionCount < coverage.minNewsRequired) {
    hardFailures.push(`Not enough country action events (${coverage.countryActionCount}/${coverage.minNewsRequired})`)
  }

  if (coverage.dollarYieldCount < coverage.minNewsRequired) {
    hardFailures.push(`Not enough dollar/yield events (${coverage.dollarYieldCount}/${coverage.minNewsRequired})`)
  }

  if (coverage.sourceFailures.length > 0) {
    warnings.push(
      `Source failures: ${coverage.sourceFailures.map(f => `${f.id} (${f.error})`).join('; ')}`
    )
  }

  const report: VerificationReport = {
    checkedAt: now.toISOString(),
    sourceFile: INPUT_FILE,
    dataFetchedAt: payload.fetchedAt,
    ageMinutes,
    thresholds: {
      maxAgeMinutes,
      minNewsPerCategory: coverage.minNewsRequired
    },
    coverage,
    hardFailures,
    warnings,
    canProceedToIntegration: hardFailures.length === 0
  }

  await Bun.write(OUTPUT_FILE, JSON.stringify(report, null, 2))

  console.log('First-principles verification report')
  console.log(`  source: ${INPUT_FILE}`)
  console.log(`  fetchedAt: ${payload.fetchedAt}`)
  console.log(`  age: ${ageMinutes} minutes`)
  console.log(`  canProceedToIntegration: ${report.canProceedToIntegration ? 'YES' : 'NO'}`)

  if (hardFailures.length > 0) {
    console.log('')
    console.log('Hard failures:')
    for (const failure of hardFailures) {
      console.log(`  - ${failure}`)
    }
  }

  if (warnings.length > 0) {
    console.log('')
    console.log('Warnings:')
    for (const warning of warnings) {
      console.log(`  - ${warning}`)
    }
  }

  console.log(`\nSaved ${OUTPUT_FILE}`)

  if (strict && hardFailures.length > 0) {
    process.exit(1)
  }
}

main().catch(error => {
  console.error('Verification failed:', error)
  process.exit(1)
})
