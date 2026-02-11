// Weekly backfill - fetch historical data and fill gaps
// Usage: bun run backfill (runs weekly via CI)

import { $ } from 'bun'

async function main() {
  console.log('=== Weekly Backfill ===\n')

  // 1. Fetch short-term history (30 days) for daily indicators
  console.log('1. Fetching short-term history (30 days)...')
  await $`bun run src/fetch-history.ts 30`.quiet()
  console.log('   Done')

  // 2. Refresh 5-year history used by dashboard/AI percentile
  console.log('\n2. Fetching long-term history (5 years)...')
  await $`bun run src/fetch-long-history.ts 5`.quiet()
  console.log('   Done')

  // 3. Refresh 19-year history used by drawdown analysis
  console.log('\n3. Fetching extended history (19 years)...')
  await $`bun run src/fetch-long-history.ts 19`.quiet()
  console.log('   Done')

  // 4. Backfill Vietnam history from webgia.com
  console.log('\n4. Backfilling Vietnam history...')
  await $`bun run src/backfill-vietnam.ts`.quiet()
  console.log('   Done')

  // 5. Recompute drawdowns with latest extended history
  console.log('\n5. Recomputing drawdowns...')
  await $`bun run src/analyze-drawdowns.ts 10 data/history-19y.json`.quiet()
  console.log('   Done')

  console.log('\n✓ Backfill complete')
}

main().catch(e => {
  console.error('Error:', e.message)
  process.exit(1)
})
