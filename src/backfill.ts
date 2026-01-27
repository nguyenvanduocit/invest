// Weekly backfill - fetch historical data and fill gaps
// Usage: bun run backfill (runs weekly via CI)

import { $ } from 'bun'

async function main() {
  console.log('=== Weekly Backfill ===\n')

  // 1. Fetch international history (1 year)
  console.log('1. Fetching international history (1 year)...')
  await $`bun run src/fetch-history.ts`.quiet()
  console.log('   Done')

  // 2. Backfill Vietnam history from webgia.com
  console.log('\n2. Backfilling Vietnam history...')
  await $`bun run src/backfill-vietnam.ts`.quiet()
  console.log('   Done')

  console.log('\n✓ Backfill complete')
}

main().catch(e => {
  console.error('Error:', e.message)
  process.exit(1)
})
