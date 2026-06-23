#!/usr/bin/env npx tsx
/**
 * Hospitable field mapping validation — NO Claude calls, no tokens burned.
 *
 * Fetches properties from the Hospitable API, logs the RAW response first
 * (so you can see the true field names), then logs the mapped ListingInput
 * + readiness verdict for side-by-side comparison.
 *
 * Designed to answer these four field-mapping uncertainties:
 *   1. photos — full array or just single `picture` URL? What field?
 *   2. title  — guest-facing title in `public_name` or `name`?
 *   3. amenities — flat string[] or array of objects?
 *   4. location — is `address.display` present?
 *
 * Reviews are NOT fetched (deferred to v2 per Hospitable's guidance).
 *
 * Usage:
 *   HOSPITABLE_PAT=xxx npx tsx scripts/hospitable-fetch-test.ts
 *
 *   Or set HOSPITABLE_PAT in .env.local and run:
 *   npx tsx --env-file=.env.local scripts/hospitable-fetch-test.ts
 *
 * Raw API responses saved to scripts/hospitable-fetch-output/ for inspection.
 */

import fs from 'node:fs'
import path from 'node:path'
import {
  fetchHospitableListingInputs,
  mapPropertyToInput,
  auditReadiness,
} from '@/app/lib/integrations/hospitable-adapter'

const OUTPUT_DIR = path.join(__dirname, 'hospitable-fetch-output')

async function main() {
  const token = process.env.HOSPITABLE_PAT
  if (!token) {
    console.error('Missing HOSPITABLE_PAT. Set it as an env var or in .env.local.')
    console.error('Usage: HOSPITABLE_PAT=xxx npx tsx scripts/hospitable-fetch-test.ts')
    process.exit(1)
  }

  console.log('Fetching Hospitable properties (include=listings,details, no reviews)...\n')

  const items = await fetchHospitableListingInputs({ token, includeReviews: false })

  if (items.length === 0) {
    console.log('No properties found. Check your token and that you have properties in Hospitable.')
    return
  }

  console.log(`Found ${items.length} property/properties.\n`)

  fs.mkdirSync(OUTPUT_DIR, { recursive: true })

  for (const { input, readiness, raw } of items) {
    const id = raw.id ?? 'unknown'
    const name = raw.name ?? raw.public_name ?? '(unnamed)'

    console.log('='.repeat(70))
    console.log(`PROPERTY: ${id} (${name})`)
    console.log('='.repeat(70))

    // ---- RAW RESPONSE (log FIRST so you see the true field names) ----
    console.log('\n--- RAW API RESPONSE ---')
    console.log(JSON.stringify(raw, null, 2))

    // ---- Key field spotlight (the 4 uncertainties) ----
    console.log('\n--- FIELD SPOTLIGHT (4 uncertainties) ---')
    console.log(`  title candidates:`)
    console.log(`    raw.public_name = ${JSON.stringify(raw.public_name)}`)
    console.log(`    raw.name        = ${JSON.stringify(raw.name)}`)
    console.log(`  photos:`)
    console.log(`    raw.picture     = ${JSON.stringify(raw.picture)}`)
    console.log(`    raw.photos      = ${JSON.stringify(raw.photos)}`)
    console.log(`    raw.images      = ${JSON.stringify(raw.images)}`)
    console.log(`    raw.photo_urls  = ${JSON.stringify(raw.photo_urls)}`)
    // Check if details include brought extra fields
    console.log(`    raw.details     = ${JSON.stringify(raw.details)}`)
    console.log(`  amenities type:`)
    if (Array.isArray(raw.amenities) && raw.amenities.length > 0) {
      console.log(`    typeof first element = ${typeof raw.amenities[0]}`)
      console.log(`    first 3 elements = ${JSON.stringify(raw.amenities.slice(0, 3))}`)
    } else {
      console.log(`    raw.amenities = ${JSON.stringify(raw.amenities)}`)
    }
    console.log(`  location:`)
    console.log(`    raw.address.display = ${JSON.stringify(raw.address?.display)}`)
    console.log(`    raw.address.city    = ${JSON.stringify(raw.address?.city)}`)

    // ---- MAPPED OUTPUT ----
    console.log('\n--- MAPPED ListingInput ---')
    console.log(JSON.stringify(input, null, 2))

    console.log(`\nReadiness: ${readiness.mode}${readiness.missing.length ? ` (missing: ${readiness.missing.join(', ')})` : ''}`)

    // Warnings
    const warnings: string[] = []
    if (!input.title) warnings.push('title is empty — check raw.public_name / raw.name')
    if (!input.description) warnings.push('description is empty — check raw.description / raw.summary')
    if (!input.amenities?.length) warnings.push('amenities is empty — check raw.amenities')
    if (!input.photoCount && !input.photoUrls?.length) warnings.push('no photos — check raw.picture and any photos/images fields')
    if (!input.location) warnings.push('location is empty — check raw.address')
    if (!input.url) warnings.push('no Airbnb URL — check raw.listings[] for platform=airbnb with platform_id')

    if (warnings.length) {
      console.log('\nWARNINGS:')
      for (const w of warnings) console.log(`  ⚠ ${w}`)
    }

    // Save raw response for manual inspection
    const rawPath = path.join(OUTPUT_DIR, `${id}.raw.json`)
    fs.writeFileSync(rawPath, JSON.stringify(raw, null, 2))
    console.log(`\nRaw saved → ${rawPath}`)
    console.log()
  }

  // Summary table
  console.log('--- SUMMARY ---')
  console.log(
    `${'ID'.padEnd(40)} ${'Title'.padEnd(35)} ${'Readiness'.padEnd(15)} Missing`
  )
  for (const { input, readiness, raw } of items) {
    const id = String(raw.id ?? '?').slice(0, 38).padEnd(40)
    const title = (input.title ?? '(none)').slice(0, 33).padEnd(35)
    const mode = readiness.mode.padEnd(15)
    const missing = readiness.missing.join(', ') || '-'
    console.log(`${id} ${title} ${mode} ${missing}`)
  }
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
