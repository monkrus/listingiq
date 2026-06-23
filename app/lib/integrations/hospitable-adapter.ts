/**
 * Hospitable -> ListingIQ adapter
 *
 * Fetches properties + reviews from the Hospitable Public API v2 and maps
 * them into ListingIQ's existing ListingInput shape.
 *
 * v1 scope: TEXT audit only (title, description, amenities, photoCount).
 * Reviews: deferred to v2 per Hospitable's guidance — review-mapping code is
 * retained but gated behind includeReviews flag (default false).
 * Photo audit (vision): deferred to v2.
 *
 * Auth: Bearer token — works for both PAT (testing) and OAuth access token
 * (production). The caller supplies whichever they have.
 *
 * Field names sourced from:
 *   - OpenAPI spec in github.com/keithah/hospitable-python (openapi.yaml)
 *   - Python SDK models.py (Property, Review dataclasses)
 * These are our best reading of the spec — marked with "// BEST-GUESS" where
 * the live API may differ. Run scripts/hospitable-fetch-test.ts to validate.
 *
 * Docs: https://developer.hospitable.com/docs/public-api-docs/
 * SDK ref: https://github.com/keithah/hospitable-python
 */

import type { ListingInput } from '../types'

// ---- Config ----
const BASE_URL = 'https://public.api.hospitable.com/v2'
const MAX_PER_PAGE = 100
const REVIEWS_PER_PAGE = 50 // max per SDK docs

export interface FetchOptions {
  /** PAT or OAuth access token — both are Bearer tokens */
  token: string
  /** Only return properties with this specific UUID */
  propertyId?: string
  /** Fetch and attach reviews per property. Default false — reviews deferred to v2 per Hospitable's guidance. */
  includeReviews?: boolean
}

// ---- HTTP helper ----

async function hospGet(path: string, token: string, params?: Record<string, string>): Promise<any> {
  const url = new URL(`${BASE_URL}${path}`)
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, v)
    }
  }

  const res = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    },
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Hospitable ${res.status} on ${path}: ${body}`)
  }

  return res.json()
}

// ---- Paginated fetchers ----

/** Fetch all properties (paginated). */
async function getAllProperties(token: string): Promise<any[]> {
  const all: any[] = []
  let page = 1

  while (true) {
    const data = await hospGet('/properties', token, {
      page: String(page),
      per_page: String(MAX_PER_PAGE),
      // include=listings for platform_id (Airbnb URL), include=details for richer
      // property data (may surface photos array). Per SDK docs, valid includes:
      // user, listings, details, bookings
      include: 'listings,details',
    })

    const batch = data?.data ?? []
    all.push(...batch)

    // Pagination: stop when we've reached the last page
    const meta = data?.meta
    if (!meta || page >= (meta.last_page ?? page)) break
    page++
    await sleep(250)
  }

  return all
}

/** Fetch reviews for a single property (paginated). */
async function getPropertyReviews(
  token: string,
  propertyUuid: string
): Promise<{ comments: string[]; ratings: number[] }> {
  const allReviewData: any[] = []
  let page = 1

  while (true) {
    const data = await hospGet(`/properties/${propertyUuid}/reviews`, token, {
      page: String(page),
      per_page: String(REVIEWS_PER_PAGE),
    })

    const batch = data?.data ?? []
    allReviewData.push(...batch)

    const meta = data?.meta
    if (!meta || page >= (meta.last_page ?? page)) break
    page++
    await sleep(250)
  }

  return extractReviews(allReviewData)
}

// ---- Review extraction (exported for testing) ----

/** Parse reviews from raw API response data (the `data` array from GET /properties/{uuid}/reviews). */
export function extractReviews(reviewDataArray: any[]): { comments: string[]; ratings: number[] } {
  const comments: string[] = []
  const ratings: number[] = []
  for (const r of reviewDataArray) {
    const reviewText = r?.public?.review
    const rating = r?.public?.rating
    if (reviewText) comments.push(String(reviewText))
    if (typeof rating === 'number') ratings.push(rating)
  }
  return { comments, ratings }
}

// ---- Property -> ListingInput mapping (exported for testing) ----

export function mapPropertyToInput(
  property: any,
  reviews: { comments: string[]; ratings: number[] }
): ListingInput {
  // BEST-GUESS: address is { city, state, country, display }
  const addr = property?.address ?? {}
  const location =
    addr.display ??
    ([addr.city, addr.state, addr.country].filter(Boolean).join(', ') || undefined)

  // BEST-GUESS: amenities is string[] directly on the property
  const amenities: string[] = Array.isArray(property?.amenities)
    ? property.amenities.map((a: any) => (typeof a === 'string' ? a : a?.name)).filter(Boolean)
    : []

  // BEST-GUESS: picture is a single URL; no photos array in the spec
  // The actual API may return more via include=details — unknown until tested
  const mainPicture = property?.picture
  const photoUrls: string[] = mainPicture ? [mainPicture] : []

  // Construct Airbnb URL from listings[] where platform === 'airbnb'
  const listings: any[] = property?.listings ?? []
  const airbnbListing = listings.find((l: any) => l?.platform === 'airbnb')
  const airbnbUrl = airbnbListing?.platform_id
    ? `https://www.airbnb.com/rooms/${airbnbListing.platform_id}`
    : undefined

  // Reviews
  const reviewComments = reviews.comments.slice(0, 12)
  const avgRating =
    reviews.ratings.length > 0
      ? Math.round(
          (reviews.ratings.reduce((a, b) => a + b, 0) / reviews.ratings.length) * 100
        ) / 100
      : undefined

  return {
    // BEST-GUESS: public_name is the guest-facing title, name is internal
    title: property?.public_name ?? property?.name ?? '',
    location,
    // BEST-GUESS: description is the full text, summary is a shorter version
    description: property?.description ?? property?.summary ?? '',
    amenities,
    // BEST-GUESS: only 1 photo URL from picture field; photoCount unknown
    photoCount: photoUrls.length,
    photoUrls,
    rating: avgRating,
    reviewCount: reviews.comments.length || undefined,
    reviews: reviewComments,
    url: airbnbUrl,
    isDemo: false,
  }
}

// ---- Completeness gate (same logic as Hostex adapter, exported for testing) ----

export type Readiness = { mode: 'full' | 'partial' | 'insufficient'; missing: string[] }

export function auditReadiness(input: ListingInput): Readiness {
  const missing: string[] = []
  if (!input.title) missing.push('title')
  if (!input.description) missing.push('description')
  if (!input.photoCount) missing.push('photos')
  if (!input.amenities?.length) missing.push('amenities')

  if (missing.length === 0) return { mode: 'full', missing }
  if (input.title && input.description) return { mode: 'partial', missing }
  return { mode: 'insufficient', missing }
}

// ---- Top-level: fetch everything, return audit-ready inputs ----

export async function fetchHospitableListingInputs(opts: FetchOptions): Promise<
  Array<{ input: ListingInput; readiness: Readiness; raw: any }>
> {
  let properties = await getAllProperties(opts.token)

  // Optionally narrow to a single property
  if (opts.propertyId) {
    properties = properties.filter(
      (p) => String(p.id) === String(opts.propertyId)
    )
  }

  const results: Array<{ input: ListingInput; readiness: Readiness; raw: any }> = []

  for (const property of properties) {
    const uuid = String(property.id ?? '')
    let reviews = { comments: [] as string[], ratings: [] as number[] }

    // Reviews deferred to v2 per Hospitable's guidance — only fetch if explicitly enabled
    if (opts.includeReviews && uuid) {
      try {
        reviews = await getPropertyReviews(opts.token, uuid)
      } catch (err) {
        // Reviews may fail (permissions, scope) — continue without them
        console.warn(`[hospitable] Failed to fetch reviews for ${uuid}:`, err)
      }
    }

    const input = mapPropertyToInput(property, reviews)
    results.push({ input, readiness: auditReadiness(input), raw: property })
  }

  return results
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}
