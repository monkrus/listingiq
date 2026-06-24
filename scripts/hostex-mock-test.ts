#!/usr/bin/env npx tsx
/**
 * Mock test for the Hostex adapter.
 *
 * Since we can't get real Hostex data (no published listing), this test:
 * 1. Mocks the Hostex API responses based on the documented schema
 * 2. Runs them through the adapter's mapping logic
 * 3. Verifies the mapped ListingInput is correct
 * 4. Optionally runs a full audit through analyzeListingInput()
 *
 * Usage:
 *   npx tsx scripts/hostex-mock-test.ts              # mapping test only (no API keys needed)
 *   npx tsx scripts/hostex-mock-test.ts --audit       # also runs Claude audit (needs ANTHROPIC_API_KEY)
 */

import type { ListingInput } from '@/app/lib/types'

// ---- Mock Hostex API responses based on documented schema ----

// /v3/listings response (documented fields)
const MOCK_LISTINGS_RESPONSE = {
  request_id: 'RT_MOCK_001',
  error_code: 200,
  error_msg: 'Done.',
  data: {
    listings: [
      {
        channel_account_id: 12345,
        listing_id: '1711964105649925041',
        channel_type: 'airbnb',
        listing_title: 'Cozy Downtown Loft with Skyline Views',
        currency: 'USD',
        // The adapter also checks for a `metadata` object.
        // Based on Hostex docs, the listings endpoint is minimal,
        // but we include metadata to test the adapter's mapping
        // in case Hostex adds richer data in the future.
        metadata: {
          title: 'Cozy Downtown Loft with Skyline Views',
          name: 'Downtown Loft',
          description:
            'Welcome to our beautifully renovated downtown loft! ' +
            'This stylish space features exposed brick walls, floor-to-ceiling windows ' +
            'with stunning city skyline views, and modern amenities throughout. ' +
            'Perfect for couples or solo travelers looking for an urban retreat. ' +
            'Walk to restaurants, nightlife, and public transit within minutes.',
          summary: 'Stylish downtown loft with skyline views',
          amenities: [
            'WiFi',
            'Air conditioning',
            'Kitchen',
            'Washer',
            'Dryer',
            'Free parking',
            'TV',
            'Coffee maker',
            'Hair dryer',
            'Iron',
            'Smoke alarm',
            'First aid kit',
          ],
          photos: [
            { url: 'https://example.com/photo1.jpg' },
            { url: 'https://example.com/photo2.jpg' },
            { url: 'https://example.com/photo3.jpg' },
            { url: 'https://example.com/photo4.jpg' },
            { url: 'https://example.com/photo5.jpg' },
          ],
          photo_count: 5,
          city: 'Austin',
          state: 'Texas',
          country: 'US',
          rating: 4.85,
          review_count: 42,
          listing_url: 'https://www.airbnb.com/rooms/1711964105649925041',
        },
      },
      {
        // Minimal listing — only documented fields, no metadata
        channel_account_id: 12345,
        listing_id: '9999999999',
        channel_type: 'airbnb',
        listing_title: 'Beach Bungalow',
        currency: 'USD',
      },
    ],
    total: 2,
  },
}

// /v3/reviews response
const MOCK_REVIEWS_RESPONSE = {
  request_id: 'RT_MOCK_002',
  error_code: 200,
  error_msg: 'Done.',
  data: {
    reviews: [
      {
        listing_id: '1711964105649925041',
        comment: 'Amazing place! The views were incredible and the location was perfect for exploring downtown.',
        rating: 5,
      },
      {
        listing_id: '1711964105649925041',
        comment: 'Very clean and well-equipped. Only issue was some street noise at night but the host provided earplugs.',
        rating: 4,
      },
      {
        listing_id: '1711964105649925041',
        comment: 'Great loft, exactly as described. Check-in was seamless. Would definitely stay again!',
        rating: 5,
      },
    ],
  },
}

// ---- Replicate the adapter's mapping logic for unit testing ----
// (Imported types only, logic duplicated to avoid needing HTTP mocks)

function mapHostexListingToInput(
  listing: any,
  reviews?: { comments: string[]; ratings: number[] }
): ListingInput {
  const m = listing?.metadata ?? {}

  const location =
    m.location ??
    ([m.city, m.state, m.country].filter(Boolean).join(', ') || undefined)

  const photoUrls: string[] = Array.isArray(m.photos)
    ? m.photos
        .map((p: any) => (typeof p === 'string' ? p : p?.url))
        .filter(Boolean)
        .slice(0, 10)
    : []

  const reviewComments = (reviews?.comments ?? []).slice(0, 12)
  const ratings = reviews?.ratings ?? []
  const avgRating =
    ratings.length > 0
      ? Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 100) / 100
      : m.rating ?? undefined

  return {
    title: m.title ?? m.name ?? '',
    location,
    description: m.description ?? m.summary ?? '',
    amenities: Array.isArray(m.amenities)
      ? m.amenities.map((a: any) => (typeof a === 'string' ? a : a?.name)).filter(Boolean)
      : [],
    photoCount: typeof m.photo_count === 'number' ? m.photo_count : photoUrls.length,
    photoUrls,
    rating: avgRating,
    reviewCount: reviews?.comments.length ?? m.review_count ?? undefined,
    reviews: reviewComments,
    url: m.listing_url ?? listing.listing_url ?? undefined,
    isDemo: false,
  }
}

type Readiness = { mode: 'full' | 'partial' | 'insufficient'; missing: string[] }

function auditReadiness(input: ListingInput): Readiness {
  const missing: string[] = []
  if (!input.title) missing.push('title')
  if (!input.description) missing.push('description')
  if (!input.photoCount) missing.push('photos')
  if (!input.amenities?.length) missing.push('amenities')

  if (missing.length === 0) return { mode: 'full', missing }
  if (input.title && input.description) return { mode: 'partial', missing }
  return { mode: 'insufficient', missing }
}

// ---- Test runner ----

function assert(condition: boolean, msg: string) {
  if (!condition) {
    console.error(`  FAIL: ${msg}`)
    process.exitCode = 1
  } else {
    console.log(`  PASS: ${msg}`)
  }
}

async function main() {
  const runAudit = process.argv.includes('--audit')

  console.log('=== Hostex Adapter Mock Test ===\n')

  // Build review map (same as adapter does)
  const reviewMap = new Map<string, { comments: string[]; ratings: number[] }>()
  for (const r of MOCK_REVIEWS_RESPONSE.data.reviews) {
    const key = String(r.listing_id)
    if (!reviewMap.has(key)) reviewMap.set(key, { comments: [], ratings: [] })
    const entry = reviewMap.get(key)!
    if (r.comment) entry.comments.push(r.comment)
    if (typeof r.rating === 'number') entry.ratings.push(r.rating)
  }

  const listings = MOCK_LISTINGS_RESPONSE.data.listings

  // ---- Test 1: Rich listing with metadata + reviews ----
  console.log('--- Test 1: Rich listing (metadata + reviews) ---')
  const rich = listings[0]
  const richReviews = reviewMap.get(String(rich.listing_id))
  const richInput = mapHostexListingToInput(rich, richReviews)
  const richReadiness = auditReadiness(richInput)

  assert(richInput.title === 'Cozy Downtown Loft with Skyline Views', 'title mapped correctly')
  assert(richInput.location === 'Austin, Texas, US', 'location assembled from city/state/country')
  assert(richInput.description!.includes('beautifully renovated'), 'description mapped')
  assert(richInput.amenities!.length === 12, `amenities count = 12 (got ${richInput.amenities!.length})`)
  assert(richInput.photoCount === 5, `photoCount = 5 (got ${richInput.photoCount})`)
  assert(richInput.photoUrls!.length === 5, `photoUrls extracted from objects (got ${richInput.photoUrls!.length})`)
  assert(richInput.rating === 4.67, `rating = avg of reviews 4.67 (got ${richInput.rating})`)
  assert(richInput.reviewCount === 3, `reviewCount = 3 from reviews (got ${richInput.reviewCount})`)
  assert(richInput.reviews!.length === 3, `reviews mapped (got ${richInput.reviews!.length})`)
  assert(richInput.url === 'https://www.airbnb.com/rooms/1711964105649925041', 'url mapped')
  assert(richReadiness.mode === 'full', `readiness = full (got ${richReadiness.mode})`)

  console.log('\nMapped ListingInput:')
  console.log(JSON.stringify(richInput, null, 2))

  // ---- Test 2: Minimal listing (no metadata, no reviews) ----
  console.log('\n--- Test 2: Minimal listing (no metadata, no reviews) ---')
  const minimal = listings[1]
  const minimalInput = mapHostexListingToInput(minimal, undefined)
  const minimalReadiness = auditReadiness(minimalInput)

  assert(minimalInput.title === '', `title is empty when no metadata (got "${minimalInput.title}")`)
  assert(minimalInput.description === '', `description is empty (got "${minimalInput.description}")`)
  assert(minimalInput.amenities!.length === 0, `amenities is empty (got ${minimalInput.amenities!.length})`)
  assert(minimalInput.photoCount === 0, `photoCount = 0 (got ${minimalInput.photoCount})`)
  assert(minimalReadiness.mode === 'insufficient', `readiness = insufficient (got ${minimalReadiness.mode})`)
  assert(
    minimalReadiness.missing.includes('title') && minimalReadiness.missing.includes('description'),
    `missing includes title and description`
  )

  console.log('\nMapped ListingInput:')
  console.log(JSON.stringify(minimalInput, null, 2))

  // ---- Test 3: Photo URL formats ----
  console.log('\n--- Test 3: Photo URL formats (string vs object) ---')
  const stringPhotos = { metadata: { photos: ['url1.jpg', 'url2.jpg'] } }
  const objPhotos = { metadata: { photos: [{ url: 'url1.jpg' }, { url: 'url2.jpg' }] } }
  const mixedPhotos = { metadata: { photos: ['url1.jpg', { url: 'url2.jpg' }, null, undefined] } }

  const s = mapHostexListingToInput(stringPhotos)
  const o = mapHostexListingToInput(objPhotos)
  const m = mapHostexListingToInput(mixedPhotos)

  assert(s.photoUrls!.length === 2, `string photo URLs extracted (got ${s.photoUrls!.length})`)
  assert(o.photoUrls!.length === 2, `object photo URLs extracted (got ${o.photoUrls!.length})`)
  assert(m.photoUrls!.length === 2, `mixed photo URLs extracted, nulls filtered (got ${m.photoUrls!.length})`)

  // ---- Test 4: Amenity formats ----
  console.log('\n--- Test 4: Amenity formats (string vs object) ---')
  const strAmenities = { metadata: { amenities: ['WiFi', 'Pool'] } }
  const objAmenities = { metadata: { amenities: [{ name: 'WiFi' }, { name: 'Pool' }] } }

  const sa = mapHostexListingToInput(strAmenities)
  const oa = mapHostexListingToInput(objAmenities)

  assert(sa.amenities![0] === 'WiFi', `string amenities mapped (got "${sa.amenities![0]}")`)
  assert(oa.amenities![0] === 'WiFi', `object amenities mapped (got "${oa.amenities![0]}")`)

  // ---- Summary ----
  console.log('\n=== Summary ===')
  const exitCode = process.exitCode ?? 0
  if (exitCode === 0) {
    console.log('All mapping tests passed!')
  } else {
    console.log('Some tests failed - see above.')
  }

  // ---- Optional: Full audit through Claude ----
  if (runAudit) {
    if (!process.env.ANTHROPIC_API_KEY) {
      console.error('\nSkipping audit: ANTHROPIC_API_KEY not set.')
      return
    }

    console.log('\n=== Running full audit through analyzeListingInput() ===')
    const { analyzeListingInput } = await import('@/app/lib/analyze-core')

    const report = await analyzeListingInput(richInput, {
      sourceLabel: 'data imported from Hostex PMS (mock test)',
    })

    console.log(`\nOverall Score: ${report.overallScore}`)
    console.log(`Title Score: ${report.titleScore}`)
    console.log(`Description Score: ${report.descriptionScore}`)
    console.log(`Photo Score: ${report.photoScore}`)
    console.log(`Amenity Score: ${report.amenityScore}`)
    console.log(`Persona Score: ${report.personaScore}`)
    console.log(`Review Score: ${report.reviewScore}`)
    console.log('\nPriority Actions:')
    for (const action of (report as any).priorityActions) {
      console.log(`  - ${action}`)
    }
    console.log('\nFull report:')
    console.log(JSON.stringify(report, null, 2))
  }
}

main().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
