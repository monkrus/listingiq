#!/usr/bin/env npx tsx
/**
 * Regression test: exercises the manual flow's analysis pipeline
 * (scrape → analyzeListingInput) and writes each report to a JSON file.
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/regression-manual.ts <url1> [url2] [url3]
 *
 * Outputs: scripts/regression-output/<room-id>.json
 *
 * Reads ANTHROPIC_API_KEY (and optionally AIRBNB_API_KEY) from .env.local
 * via Node's --env-file flag (loaded before any module code runs).
 *
 * To compare against main:
 *   1. Run this script on the hostex-adapter branch → outputs land in regression-output/
 *   2. Copy the output dir:  cp -r scripts/regression-output scripts/regression-output-hostex
 *   3. git checkout main
 *   4. Run:  npx tsx scripts/regression-manual-baseline.ts <same urls>
 *      (This baseline script inlines the old route.ts logic and doesn't need analyze-core.)
 *   5. Diff:  diff -u scripts/regression-output-baseline/ scripts/regression-output-hostex/
 *
 * NOTE: Claude at temperature 0 is near-deterministic but not perfectly so.
 * Expect minor wording variation between runs. Material differences (different
 * scores, missing sections, changed prompt structure) indicate a real regression.
 */

import fs from 'node:fs'
import path from 'node:path'
import { scrapeAirbnbListing, isValidAirbnbUrl } from '@/app/lib/scraper'
import { analyzeListingInput } from '@/app/lib/analyze-core'

const OUTPUT_DIR = path.join(__dirname, 'regression-output')

function extractRoomId(url: string): string {
  const match = url.match(/\/rooms\/(\d+)/)
  return match ? match[1] : url.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 40)
}

async function main() {
  const urls = process.argv.slice(2).filter(Boolean)
  if (urls.length === 0) {
    console.error('Usage: npx tsx scripts/regression-manual.ts <airbnb-url> [url2] [url3]')
    process.exit(1)
  }

  // Validate URLs before starting
  for (const url of urls) {
    if (!isValidAirbnbUrl(url)) {
      console.error(`Invalid Airbnb URL: ${url}`)
      process.exit(1)
    }
  }

  fs.mkdirSync(OUTPUT_DIR, { recursive: true })

  for (const url of urls) {
    const roomId = extractRoomId(url)
    console.log(`\n--- ${roomId} ---`)
    console.log(`Scraping: ${url}`)

    const scraped = await scrapeAirbnbListing(url)
    if (!scraped.scrapeSuccess || !scraped.title) {
      console.error(`  Scrape FAILED: ${scraped.scrapeError ?? 'no title extracted'}`)
      fs.writeFileSync(
        path.join(OUTPUT_DIR, `${roomId}.scrape-failed.json`),
        JSON.stringify({ url, error: scraped.scrapeError, scraped }, null, 2)
      )
      continue
    }

    console.log(`  Title: ${scraped.title}`)
    console.log(`  Location: ${scraped.location}`)
    console.log(`  Amenities: ${scraped.amenities?.length ?? 0}`)
    console.log(`  Reviews: ${scraped.reviews?.length ?? 0}`)
    console.log(`  Photos: ${scraped.photoCount}`)

    // Save the scraped input so we can verify prompt equivalence
    const inputPath = path.join(OUTPUT_DIR, `${roomId}.input.json`)
    fs.writeFileSync(inputPath, JSON.stringify(scraped, null, 2))
    console.log(`  Saved input → ${inputPath}`)

    // Replicate the prompt the old code would build (for diffing against baseline).
    // analyzeListingInput() clamps then builds the prompt internally — this mirrors
    // what the OLD code did (buildPrompt on unclamped scraped data with wasScraped=true).
    // If these prompts differ between branches, we have a real regression.
    const oldStylePrompt = `Analyze this Airbnb listing (data auto-extracted from the listing page):

Title: ${scraped.title}
Location: ${scraped.location ?? 'Unknown'}
Description: ${scraped.description}
Amenities: ${scraped.amenities?.join(', ') ?? 'Not listed'}
Photos: ${scraped.photoCount ?? 0} photos on listing (count only — you have NOT seen the actual images)
Rating: ${scraped.rating ?? 'No rating'} ${scraped.reviewCount ? `(${scraped.reviewCount} reviews)` : ''}
Recent guest reviews: ${scraped.reviews?.join(' | ') ?? 'None'}

Provide a detailed, actionable optimization report. Be specific — reference the actual title and description content. Scores should reflect real weaknesses, not be artificially high.`
    fs.writeFileSync(path.join(OUTPUT_DIR, `${roomId}.prompt.txt`), oldStylePrompt)

    console.log(`  Analyzing (calling Claude)...`)
    try {
      const report = await analyzeListingInput(scraped, {
        sourceLabel: 'data auto-extracted from the listing page',
      })

      const reportPath = path.join(OUTPUT_DIR, `${roomId}.report.json`)
      fs.writeFileSync(reportPath, JSON.stringify(report, null, 2))
      console.log(`  Score: ${report.overallScore}`)
      console.log(`  Saved report → ${reportPath}`)
    } catch (err) {
      console.error(`  Analysis FAILED:`, err instanceof Error ? err.message : err)
      fs.writeFileSync(
        path.join(OUTPUT_DIR, `${roomId}.analysis-failed.json`),
        JSON.stringify({ url, error: String(err) }, null, 2)
      )
    }
  }

  console.log(`\nDone. Reports in ${OUTPUT_DIR}/`)
}

main().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
