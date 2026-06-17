#!/usr/bin/env npx tsx
/**
 * Side-by-side audit comparison: Hostex path vs manual scrape path.
 *
 * Takes one Airbnb listing that exists in BOTH:
 *   1. Your Hostex account (fetched via adapter)
 *   2. Live on Airbnb (scraped via scrapeAirbnbListing)
 *
 * Audits it both ways through analyzeListingInput() and writes the two
 * reports plus a diff summary. This is the acceptance test for the
 * Hostex integration — if both paths produce substantively similar
 * reports from the same listing, the adapter is working correctly.
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/hostex-vs-manual.ts \
 *     --hostex-listing-id=HOSTEX_ID \
 *     --airbnb-url=https://www.airbnb.com/rooms/XXXXX
 *
 * Required env vars (in .env.local or exported):
 *   HOSTEX_ACCESS_TOKEN  — your Hostex API token
 *   ANTHROPIC_API_KEY    — for the Claude audit calls
 *
 * Output: scripts/hostex-vs-manual-output/
 */

import fs from 'node:fs'
import path from 'node:path'
import { fetchHostexListingInputs } from '@/app/lib/integrations/hostex-adapter'
import { scrapeAirbnbListing, isValidAirbnbUrl } from '@/app/lib/scraper'
import { analyzeListingInput } from '@/app/lib/analyze-core'

const OUTPUT_DIR = path.join(__dirname, 'hostex-vs-manual-output')

function parseArgs(): { hostexListingId: string; airbnbUrl: string } {
  const args = process.argv.slice(2)
  let hostexListingId = ''
  let airbnbUrl = ''

  for (const arg of args) {
    if (arg.startsWith('--hostex-listing-id=')) {
      hostexListingId = arg.split('=')[1]
    } else if (arg.startsWith('--airbnb-url=')) {
      airbnbUrl = arg.split('=')[1]
    }
  }

  if (!hostexListingId || !airbnbUrl) {
    console.error(`Usage: npx tsx --env-file=.env.local scripts/hostex-vs-manual.ts \\
  --hostex-listing-id=HOSTEX_ID \\
  --airbnb-url=https://www.airbnb.com/rooms/XXXXX`)
    process.exit(1)
  }

  return { hostexListingId, airbnbUrl }
}

async function main() {
  const { hostexListingId, airbnbUrl } = parseArgs()

  const accessToken = process.env.HOSTEX_ACCESS_TOKEN
  if (!accessToken) {
    console.error('Missing HOSTEX_ACCESS_TOKEN env var.')
    process.exit(1)
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('Missing ANTHROPIC_API_KEY env var.')
    process.exit(1)
  }
  if (!isValidAirbnbUrl(airbnbUrl)) {
    console.error(`Invalid Airbnb URL: ${airbnbUrl}`)
    process.exit(1)
  }

  fs.mkdirSync(OUTPUT_DIR, { recursive: true })

  // ---- Path A: Hostex ----
  console.log('=== Path A: Hostex adapter ===')
  console.log(`Fetching listing ${hostexListingId} from Hostex...`)

  const items = await fetchHostexListingInputs({ accessToken, channelType: 'airbnb' })
  const match = items.find(i => String(i.raw.listing_id ?? i.raw.id) === String(hostexListingId))

  if (!match) {
    console.error(`Listing ${hostexListingId} not found in Hostex account.`)
    console.error(`Available IDs: ${items.map(i => i.raw.listing_id ?? i.raw.id).join(', ')}`)
    process.exit(1)
  }

  console.log(`  Title: ${match.input.title}`)
  console.log(`  Readiness: ${match.readiness.mode}`)

  if (match.readiness.mode === 'insufficient') {
    console.error(`  Listing has insufficient data for audit (missing: ${match.readiness.missing.join(', ')})`)
    process.exit(1)
  }

  fs.writeFileSync(path.join(OUTPUT_DIR, 'hostex.input.json'), JSON.stringify(match.input, null, 2))

  console.log('  Analyzing via Hostex path (calling Claude)...')
  const hostexReport = await analyzeListingInput(match.input, {
    sourceLabel: 'data imported from Hostex PMS',
  })
  fs.writeFileSync(path.join(OUTPUT_DIR, 'hostex.report.json'), JSON.stringify(hostexReport, null, 2))
  console.log(`  Score: ${hostexReport.overallScore}`)

  // ---- Path B: Manual scrape ----
  console.log('\n=== Path B: Manual scrape ===')
  console.log(`Scraping: ${airbnbUrl}`)

  const scraped = await scrapeAirbnbListing(airbnbUrl)
  if (!scraped.scrapeSuccess || !scraped.title) {
    console.error(`  Scrape failed: ${scraped.scrapeError ?? 'no title extracted'}`)
    process.exit(1)
  }

  console.log(`  Title: ${scraped.title}`)
  fs.writeFileSync(path.join(OUTPUT_DIR, 'manual.input.json'), JSON.stringify(scraped, null, 2))

  console.log('  Analyzing via manual path (calling Claude)...')
  const manualReport = await analyzeListingInput(scraped, {
    sourceLabel: 'data auto-extracted from the listing page',
  })
  fs.writeFileSync(path.join(OUTPUT_DIR, 'manual.report.json'), JSON.stringify(manualReport, null, 2))
  console.log(`  Score: ${manualReport.overallScore}`)

  // ---- Comparison ----
  console.log('\n=== Comparison ===')

  const scoreFields = [
    'overallScore', 'titleScore', 'descriptionScore', 'photoScore',
    'amenityScore', 'personaScore', 'reviewScore',
  ] as const

  console.log(`${'Field'.padEnd(22)} ${'Hostex'.padEnd(10)} ${'Manual'.padEnd(10)} Delta`)
  console.log('-'.repeat(55))

  for (const field of scoreFields) {
    const h = hostexReport[field] as number ?? '-'
    const m = manualReport[field] as number ?? '-'
    const delta = typeof h === 'number' && typeof m === 'number' ? h - m : '?'
    const deltaStr = typeof delta === 'number' ? (delta >= 0 ? `+${delta}` : String(delta)) : delta
    console.log(`${field.padEnd(22)} ${String(h).padEnd(10)} ${String(m).padEnd(10)} ${deltaStr}`)
  }

  // Input field comparison
  console.log('\n--- Input field coverage ---')
  const inputFields = ['title', 'location', 'description', 'amenities', 'photoCount', 'photoUrls', 'rating', 'reviewCount', 'reviews'] as const
  console.log(`${'Field'.padEnd(15)} ${'Hostex'.padEnd(25)} Manual`)
  console.log('-'.repeat(65))

  for (const field of inputFields) {
    const hVal = match.input[field]
    const mVal = (scraped as unknown as Record<string, unknown>)[field]
    const hSummary = summarizeValue(hVal)
    const mSummary = summarizeValue(mVal)
    console.log(`${field.padEnd(15)} ${hSummary.padEnd(25)} ${mSummary}`)
  }

  console.log(`\nFull reports saved to ${OUTPUT_DIR}/`)
  console.log('To diff: diff scripts/hostex-vs-manual-output/hostex.report.json scripts/hostex-vs-manual-output/manual.report.json')
}

function summarizeValue(val: unknown): string {
  if (val === undefined || val === null) return '(missing)'
  if (typeof val === 'string') return val.length > 20 ? `"${val.slice(0, 20)}..." (${val.length} chars)` : `"${val}"`
  if (typeof val === 'number') return String(val)
  if (Array.isArray(val)) return `[${val.length} items]`
  return String(val)
}

main().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
