// Scheduled build - fetch latest data and generate dashboard
// Usage: bun run build (runs via CI schedule and on pushes)

import { $ } from 'bun'

async function main() {
  console.log('=== Scheduled Build ===\n')

  // 1. Fetch current prices (all markets)
  console.log('1. Fetching current prices...')
  await $`bun run src/fetch-all.ts`.quiet()
  console.log('   Done')

  // 2. Refresh short-term history used by dashboard + AI
  console.log('\n2. Refreshing short-term history...')
  await $`bun run src/fetch-history.ts 30`.quiet()
  console.log('   Done')

  // 3. Collect Vietnam daily snapshot
  console.log('\n3. Collecting Vietnam snapshot...')
  await $`bun run src/collect-daily.ts`.quiet()
  console.log('   Done')

  // 4. Analyze drawdowns
  console.log('\n4. Analyzing drawdowns...')
  await $`bun run src/analyze-drawdowns.ts`.quiet()
  console.log('   Done')

  // 5. Generate AI suggestion (Z.AI)
  console.log('\n5. Generating AI suggestion...')
  await $`bun run src/generate-ai-suggestion.ts`.quiet()
  console.log('   Done')

  // 6. Generate dashboard
  console.log('\n6. Generating dashboard...')
  await $`bun run src/generate-dashboard.ts`.quiet()
  console.log('   Done')

  console.log('\n✓ Build complete: data/dashboard.html')
}

main().catch(e => {
  console.error('Error:', e.message)
  process.exit(1)
})
