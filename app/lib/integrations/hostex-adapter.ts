/**
 * Hostex -> ListingIQ adapter
 *
 * Fetches Airbnb-channel listings + reviews from the Hostex API and maps them
 * into ListingIQ's existing ListingInput shape.
 *
 * v1 scope: TEXT audit only (title, description, amenities, reviews, photoCount).
 * Photo audit (base64 vision) deferred to v2.
 *
 * Auth: header token (Hostex-Access-Token). No OAuth needed for single-account v1.
 * Docs: https://api-doc.hostex.io/reference/query-listings
 */

import type { ListingInput } from '../types'

// ---- Config ----
const HOSTEX_BASE = 'https://api.hostex.io/v3'
const PAGE_LIMIT = 100

export interface FetchOptions {
  accessToken: string
  channelType?: string // default "airbnb"
}

async function hostexGet(path: string, accessToken: string): Promise<any> {
  const res = await fetch(`${HOSTEX_BASE}${path}`, {
    headers: {
      'Hostex-Access-Token': accessToken,
      'Content-Type': 'application/json',
    },
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Hostex ${res.status} on ${path}: ${body}`)
  }
  return res.json()
}

/** Paginate all listings for a channel type. */
async function getAllListings(opts: FetchOptions): Promise<any[]> {
  const channelType = opts.channelType ?? 'airbnb'
  const all: any[] = []
  let offset = 0

  while (true) {
    const data = await hostexGet(
      `/listings?channel_type=${channelType}&limit=${PAGE_LIMIT}&offset=${offset}`,
      opts.accessToken
    )
    const batch = data?.data?.listings ?? data?.listings ?? []
    all.push(...batch)
    if (batch.length < PAGE_LIMIT) break
    offset += PAGE_LIMIT
    await sleep(250)
  }
  return all
}

/** Fetch reviews and bucket by listing_id. */
async function getReviewsByListing(
  accessToken: string
): Promise<Map<string, { comments: string[]; ratings: number[] }>> {
  const map = new Map<string, { comments: string[]; ratings: number[] }>()
  let offset = 0

  while (true) {
    const data = await hostexGet(
      `/reviews?limit=${PAGE_LIMIT}&offset=${offset}`,
      accessToken
    )
    const batch = data?.data?.reviews ?? data?.reviews ?? []
    for (const r of batch) {
      const key = String(r.listing_id ?? r.property_id ?? '')
      if (!key) continue
      if (!map.has(key)) map.set(key, { comments: [], ratings: [] })
      const entry = map.get(key)!
      if (r.comment) entry.comments.push(String(r.comment))
      if (typeof r.rating === 'number') entry.ratings.push(r.rating)
    }
    if (batch.length < PAGE_LIMIT) break
    offset += PAGE_LIMIT
    await sleep(250)
  }
  return map
}

// ---- Hostex listing -> ListingInput ----
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

// ---- Completeness gate ----
export type Readiness = { mode: 'full' | 'partial' | 'insufficient'; missing: string[] }

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

// ---- Top-level: fetch everything, return audit-ready inputs ----
export async function fetchHostexListingInputs(opts: FetchOptions): Promise<
  Array<{ input: ListingInput; readiness: Readiness; raw: any }>
> {
  const [listings, reviewsByListing] = await Promise.all([
    getAllListings(opts),
    getReviewsByListing(opts.accessToken),
  ])

  return listings.map((listing) => {
    const key = String(listing.listing_id ?? listing.id ?? '')
    const input = mapHostexListingToInput(listing, reviewsByListing.get(key))
    return { input, readiness: auditReadiness(input), raw: listing }
  })
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}
