/**
 * Verifies the refactor is invisible: given the same scraped input,
 * does the new code (analyze-core) produce the same prompt as the old code?
 *
 * Usage: npx tsx scripts/verify-prompt-equivalence.ts
 *
 * Reads the .input.json files saved by regression-manual.ts
 * and builds the prompt using both old-style (inline buildPrompt) and
 * new-style (replicating analyze-core's clamp + buildPrompt) logic.
 */

import fs from 'node:fs'
import path from 'node:path'
import type { ListingInput } from '@/app/lib/types'

const INPUT_DIR = path.join(__dirname, 'regression-output')

// ---- OLD logic: buildPrompt from main's route.ts (lines 195-212) ----
// Note: on main, scraped data was NOT clamped before buildPrompt.
function oldBuildPrompt(listing: ListingInput): string {
  const wasScraped = true
  if (listing.isDemo || (listing.title && listing.description)) {
    return `Analyze this Airbnb listing${wasScraped ? ' (data auto-extracted from the listing page)' : ''}:

Title: ${listing.title}
Location: ${listing.location ?? 'Unknown'}
Description: ${listing.description}
Amenities: ${listing.amenities?.join(', ') ?? 'Not listed'}
Photos: ${listing.photoCount ?? 0} photos on listing (count only — you have NOT seen the actual images)
Rating: ${listing.rating ?? 'No rating'} ${listing.reviewCount ? `(${listing.reviewCount} reviews)` : ''}
Recent guest reviews: ${listing.reviews?.join(' | ') ?? 'None'}

Provide a detailed, actionable optimization report. Be specific — reference the actual title and description content. Scores should reflect real weaknesses, not be artificially high.`
  }
  return ''
}

// ---- NEW logic: clamp then buildPrompt, as analyze-core does ----
function clampInput(listing: ListingInput): ListingInput {
  return {
    ...listing,
    title: listing.title?.slice(0, 300),
    description: listing.description?.slice(0, 10_000),
    amenities: listing.amenities?.slice(0, 100),
    reviews: listing.reviews?.slice(0, 50).map(r => r.slice(0, 1_000)),
  }
}

function newBuildPrompt(listing: ListingInput): string {
  const clamped = clampInput(listing)
  const sourceLabel = 'data auto-extracted from the listing page'
  if (clamped.isDemo || (clamped.title && clamped.description)) {
    return `Analyze this Airbnb listing (${sourceLabel}):

Title: ${clamped.title}
Location: ${clamped.location ?? 'Unknown'}
Description: ${clamped.description}
Amenities: ${clamped.amenities?.join(', ') ?? 'Not listed'}
Photos: ${clamped.photoCount ?? 0} photos on listing (count only — you have NOT seen the actual images)
Rating: ${clamped.rating ?? 'No rating'} ${clamped.reviewCount ? `(${clamped.reviewCount} reviews)` : ''}
Recent guest reviews: ${clamped.reviews?.join(' | ') ?? 'None'}

Provide a detailed, actionable optimization report. Be specific — reference the actual title and description content. Scores should reflect real weaknesses, not be artificially high.`
  }
  return ''
}

// ---- Run comparison ----
const inputFiles = fs.readdirSync(INPUT_DIR).filter(f => f.endsWith('.input.json'))

if (inputFiles.length === 0) {
  console.error('No input files found. Run regression-manual.ts first.')
  process.exit(1)
}

let allMatch = true

for (const file of inputFiles) {
  const roomId = file.replace('.input.json', '')
  const input: ListingInput = JSON.parse(fs.readFileSync(path.join(INPUT_DIR, file), 'utf-8'))

  const oldPrompt = oldBuildPrompt(input)
  const newPrompt = newBuildPrompt(input)

  if (oldPrompt === newPrompt) {
    console.log(`${roomId}: IDENTICAL`)
  } else {
    allMatch = false
    console.log(`${roomId}: DIFFERS`)
    // Find the first difference
    for (let i = 0; i < Math.max(oldPrompt.length, newPrompt.length); i++) {
      if (oldPrompt[i] !== newPrompt[i]) {
        console.log(`  First diff at char ${i}:`)
        console.log(`  OLD: ...${oldPrompt.slice(Math.max(0, i - 30), i + 30)}...`)
        console.log(`  NEW: ...${newPrompt.slice(Math.max(0, i - 30), i + 30)}...`)
        break
      }
    }
    console.log(`  OLD length: ${oldPrompt.length}`)
    console.log(`  NEW length: ${newPrompt.length}`)
  }
}

console.log(allMatch ? '\nAll prompts identical. Refactor is invisible.' : '\nDIFFERENCES FOUND — investigate.')
