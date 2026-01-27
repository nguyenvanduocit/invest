// Daily build - fetch today's data and generate dashboard
// Usage: bun run build (runs daily via CI)

import { $ } from 'bun'

async function main() {
  console.log('=== Daily Build ===\n')

  // 1. Fetch current prices (all markets)
  console.log('1. Fetching current prices...')
  await $`bun run src/fetch-all.ts`.quiet()
  console.log('   Done')

  // 2. Collect Vietnam daily snapshot
  console.log('\n2. Collecting Vietnam snapshot...')
  await $`bun run src/collect-daily.ts`.quiet()
  console.log('   Done')

  // 3. Generate dashboard
  console.log('\n3. Generating dashboard...')
  await $`bun run src/generate-dashboard.ts`.quiet()
  console.log('   Done')

  console.log('\n✓ Build complete: data/dashboard.html')
}

main().catch(e => {
  console.error('Error:', e.message)
  process.exit(1)
})
