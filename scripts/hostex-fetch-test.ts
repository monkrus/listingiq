#!/usr/bin/env npx tsx
/**
 * Hostex field mapping validation — NO Claude calls, no tokens burned.
 *
 * Calls fetchHostexListingInputs() with a real Hostex access token,
 * then logs each mapped ListingInput and its readiness verdict as
 * readable JSON. Use this to validate that the adapter's best-guess
 * field names (metadata.title, metadata.description, etc.) actually
 * match the real Hostex API response.
 *
 * Usage:
 *   HOSTEX_ACCESS_TOKEN=xxx npx tsx scripts/hostex-fetch-test.ts
 *
 *   Or set HOSTEX_ACCESS_TOKEN in .env.local and run:
 *   npx tsx --env-file=.env.local scripts/hostex-fetch-test.ts
 *
 * Output goes to stdout (pipe to file or jq as needed).
 * Raw API responses are saved to scripts/hostex-fetch-output/ for inspection.
 */

import fs from 'node:fs'
import path from 'node:path'
import { fetchHostexListingInputs } from '@/app/lib/integrations/hostex-adapter'

const OUTPUT_DIR = path.join(__dirname, 'hostex-fetch-output')

async function main() {
  const accessToken = process.env.HOSTEX_ACCESS_TOKEN
  if (!accessToken) {
    console.error('Missing HOSTEX_ACCESS_TOKEN. Set it as an env var or in .env.local.')
    console.error('Usage: HOSTEX_ACCESS_TOKEN=xxx npx tsx scripts/hostex-fetch-test.ts')
    process.exit(1)
  }

  console.log('Fetching Hostex listings (channel: airbnb)...\n')

  const items = await fetchHostexListingInputs({ accessToken, channelType: 'airbnb' })

  if (items.length === 0) {
    console.log('No listings found. Check your access token and that you have Airbnb-channel listings in Hostex.')
    return
  }

  console.log(`Found ${items.length} listing(s).\n`)

  // Save raw API responses for field inspection
  fs.mkdirSync(OUTPUT_DIR, { recursive: true })

  for (const { input, readiness, raw } of items) {
    const id = raw.listing_id ?? raw.id ?? 'unknown'

    console.log(`=== Listing ${id} ===`)
    console.log(`Readiness: ${readiness.mode}${readiness.missing.length ? ` (missing: ${readiness.missing.join(', ')})` : ''}`)
    console.log()
    console.log('Mapped ListingInput:')
    console.log(JSON.stringify(input, null, 2))
    console.log()

    // Flag empty/suspicious fields so you can spot mapping problems
    const warnings: string[] = []
    if (!input.title) warnings.push('title is empty — check raw.metadata.title / raw.metadata.name')
    if (!input.description) warnings.push('description is empty — check raw.metadata.description / raw.metadata.summary')
    if (!input.amenities?.length) warnings.push('amenities is empty — check raw.metadata.amenities')
    if (!input.photoCount && !input.photoUrls?.length) warnings.push('no photos — check raw.metadata.photos / raw.metadata.photo_count')
    if (!input.location) warnings.push('location is empty — check raw.metadata.location / city / state / country')
    if (input.reviewCount === undefined && !input.reviews?.length) warnings.push('no reviews — may be expected for new listings')

    if (warnings.length) {
      console.log('WARNINGS:')
      for (const w of warnings) console.log(`  - ${w}`)
      console.log()
    }

    // Save raw response for manual inspection
    const rawPath = path.join(OUTPUT_DIR, `${id}.raw.json`)
    fs.writeFileSync(rawPath, JSON.stringify(raw, null, 2))
    console.log(`Raw API response saved → ${rawPath}`)
    console.log()
  }

  // Summary table
  console.log('--- Summary ---')
  console.log(`${'ID'.padEnd(25)} ${'Title'.padEnd(40)} ${'Readiness'.padEnd(15)} Missing`)
  for (const { input, readiness, raw } of items) {
    const id = String(raw.listing_id ?? raw.id ?? '?').padEnd(25)
    const title = (input.title ?? '(none)').slice(0, 38).padEnd(40)
    const mode = readiness.mode.padEnd(15)
    const missing = readiness.missing.join(', ') || '-'
    console.log(`${id} ${title} ${mode} ${missing}`)
  }
}

main().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
