// Scheduled build - fetch latest data and generate dashboard
// Usage: bun run build (runs via CI schedule and on pushes)

import { $ } from 'bun'

async function main() {
  console.log('=== Scheduled Build ===\n')

  // 1. Fetch current prices (all markets)
  console.log('1. Fetching current prices...')
  await $`bun run src/fetch-all.ts`.quiet()
  console.log('   Done')

  // 2. Collect Vietnam daily snapshot
  console.log('\n2. Collecting Vietnam snapshot...')
  await $`bun run src/collect-daily.ts`.quiet()
  console.log('   Done')

  // 3. Analyze drawdowns
  console.log('\n3. Analyzing drawdowns...')
  await $`bun run src/analyze-drawdowns.ts`.quiet()
  console.log('   Done')

  // 4. Generate dashboard
  console.log('\n4. Generating dashboard...')
  await $`bun run src/generate-dashboard.ts`.quiet()
  console.log('   Done')

  console.log('\n✓ Build complete: data/dashboard.html')
}

main().catch(e => {
  console.error('Error:', e.message)
  process.exit(1)
})
