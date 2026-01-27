// Main entry point - fetch all data and generate dashboard
// Usage: bun run src/main.ts

import { $ } from 'bun'

async function main() {
  console.log('=== Gold Investment Dashboard ===\n')

  // 1. Fetch international history
  console.log('1. Fetching international history...')
  await $`bun run src/fetch-history.ts`.quiet()
  console.log('   Done')

  // 2. Backfill Vietnam history
  console.log('\n2. Backfilling Vietnam history...')
  await $`bun run src/backfill-vietnam.ts`.quiet()
  console.log('   Done')

  // 3. Collect today's data (all markets)
  console.log('\n3. Fetching current prices...')
  await $`bun run src/fetch-all.ts`.quiet()
  console.log('   Done')

  // 4. Collect Vietnam daily snapshot
  console.log('\n4. Collecting Vietnam snapshot...')
  await $`bun run src/collect-daily.ts --force`.quiet()
  console.log('   Done')

  // 5. Generate dashboard
  console.log('\n5. Generating dashboard...')
  await $`bun run src/generate-dashboard.ts`.quiet()
  console.log('   Done')

  console.log('\n✓ Dashboard generated: data/dashboard.html')
}

main().catch(e => {
  console.error('Error:', e.message)
  process.exit(1)
})
