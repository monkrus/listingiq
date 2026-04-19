/**
 * Airbnb listing scraper with 3-tier fallback.
 *
 * 1. Apify (tri_angle/airbnb-scraper) — dormant until actor is rented
 * 2. apiScrape — Airbnb's public GraphQL API (current primary in production)
 * 3. fetchScrape — HTML parse fallback (different failure mode than tier 2)
 */

import { ApifyClient } from 'apify-client'
import { ListingInput } from '../types'
export { isValidAirbnbUrl } from '../validation'

export interface ScrapedListing extends ListingInput {
  scrapedAt: string
  scrapeSuccess: boolean
  scrapeError?: string
}

/** Words that appear in Airbnb UI strings but are not amenities */
const AMENITY_BLOCKLIST = [
  'about this space', 'about this place', 'show more', 'show all', 'read more',
  'amenities', 'reviews', 'location', 'policies', 'availability', 'things to know',
  'house rules', 'safety', 'cancellation', 'check-in', 'checkout', 'check in',
  'host', 'superhost', 'response', 'joined', 'verified', 'identity',
  'share', 'save', 'report', 'translate', 'photos', 'map', 'reserve',
  'night', 'total', 'taxes', 'fee', 'cleaning', 'price', 'per night',
  'guest', 'guests', 'adult', 'adults', 'child', 'children', 'infant',
  'bedroom', 'bedrooms', 'bed', 'beds', 'bath', 'baths', 'bathroom',
  'entire home', 'entire place', 'private room', 'shared room',
  'rare find', 'usually booked', 'free cancellation', 'great location',
  'self check-in', // captured separately as a known amenity
]

/** Filter extracted strings to only plausible amenities */
function isLikelyAmenity(s: string): boolean {
  const lower = s.toLowerCase()
  // Reject blocklisted UI strings
  if (AMENITY_BLOCKLIST.some(b => lower === b || lower.startsWith(b + ' '))) return false
  // Reject strings that are just numbers or dates
  if (/^\d+$/.test(s) || /^\d{1,2}\/\d{1,2}/.test(s)) return false
  // Reject strings with URLs
  if (lower.includes('http') || lower.includes('www.')) return false
  // Reject very short (1-2 chars) or very long (>60 chars)
  if (s.length < 3 || s.length > 60) return false
  // Reject strings that look like sentences (have 5+ words, likely descriptions)
  if (s.split(/\s+/).length > 6) return false
  return true
}

/** Extract the numeric listing ID from an Airbnb URL */
function extractListingId(url: string): string | null {
  const match = url.match(/rooms\/(\d+)/)
  return match?.[1] ?? null
}

// ---------------------------------------------------------------------------
// Self-healing GraphQL hash discovery
// ---------------------------------------------------------------------------

/** In-memory cache for the discovered API hash + include variables */
let cachedApiHash: { hash: string; includeVars: Record<string, boolean> } | null = null

/** Hardcoded fallback — last known working hash (updated 2026-04-18) */
const FALLBACK_HASH = 'f81911bce044e58b7c2ed3f44b3ca576af3c08988ce2c0b3ee0d6d444cfd25a1'

/**
 * Discover the current StaysPdpSections hash and required include variables
 * by fetching the listing page HTML, finding the PDP JS bundle, and parsing it.
 */
async function discoverApiHash(listingUrl: string): Promise<{ hash: string; includeVars: Record<string, boolean> } | null> {
  try {
    // Step 1: Fetch the listing HTML page
    const pageRes = await fetch(listingUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      redirect: 'follow',
    })
    if (!pageRes.ok) return null
    const html = await pageRes.text()

    // Step 2: Find the PDP JS bundle URL (contains PdpPlatformRoute)
    const bundleUrls = html.match(/https:\/\/a0\.muscache\.com\/[^"]+PdpPlatformRoute[^"]+\.js/g)
      ?? html.match(/https:\/\/a0\.muscache\.com\/[^"]+pdp[^"]+\.js/gi)
    if (!bundleUrls?.length) {
      console.warn('[scraper:discover] No PDP bundle found in HTML')
      return null
    }

    // Step 3: Fetch the JS bundle and extract the hash
    const bundleRes = await fetch(bundleUrls[0])
    if (!bundleRes.ok) return null
    const js = await bundleRes.text()

    const hashMatch = js.match(/StaysPdpSections',type:'query',operationId:'([a-f0-9]{64})'/)
    if (!hashMatch) {
      console.warn('[scraper:discover] StaysPdpSections hash not found in bundle')
      return null
    }
    const hash = hashMatch[1]

    // Step 4: Extract the include variables from the deferred state in the HTML.
    // These are the exact variables Airbnb used for this page load.
    const includeVars: Record<string, boolean> = {}
    const deferredMatch = html.match(/<script[^>]*id=["']data-deferred-state[^"']*["'][^>]*>([\s\S]*?)<\/script>/i)
    if (deferredMatch) {
      try {
        const data = JSON.parse(deferredMatch[1])
        const dataStr = JSON.stringify(data)
        // Find the StaysPdpSections query variables block
        const varsIdx = dataStr.indexOf('StaysPdpSections:{')
        if (varsIdx > -1) {
          const start = varsIdx + 'StaysPdpSections:'.length
          let depth = 0
          for (let i = start; i < dataStr.length; i++) {
            if (dataStr[i] === '{') depth++
            if (dataStr[i] === '}') depth--
            if (depth === 0) {
              const varsJson = dataStr.substring(start, i + 1)
              const parsed = JSON.parse(varsJson)
              // Extract only include* boolean fields
              for (const [k, v] of Object.entries(parsed)) {
                if (k.startsWith('include') && typeof v === 'boolean') {
                  includeVars[k] = v as boolean
                }
              }
              break
            }
          }
        }
      } catch { /* deferred state parse failure is non-fatal */ }
    }

    console.log(`[scraper:discover] Found new hash: ${hash.substring(0, 12)}... with ${Object.keys(includeVars).length} include vars`)
    return { hash, includeVars }
  } catch (err) {
    console.warn('[scraper:discover] Discovery failed:', err instanceof Error ? err.message : err)
    return null
  }
}

/** Build the default set of include variables (used when discovery can't extract them) */
function defaultIncludeVars(): Record<string, boolean> {
  return {
    includeGpAmenitiesFragment: true, includeGpBookItFragment: true,
    includeGpBookItNonExperiencedGuestFragment: true, includeGpDescriptionFragment: true,
    includeGpHeroFragment: true, includeGpHighlightsFragment: true,
    includeGpLocationPdpFragment: true, includeGpMarqueeBookItFloatingFooterFragment: true,
    includeGpMarqueeBookItNavFragment: true, includeGpMarqueeBookItSidebarFragment: true,
    includeGpMeetYourHostFragment: true, includeGpNavFragment: true,
    includeGpNavMobileFragment: true, includeGpNonExperiencedGuestLearnMoreModalFragment: true,
    includeGpOverviewV2Fragment: true, includeGpPoliciesFragment: true,
    includeGpReportToAirbnbFragment: true, includeGpReviewsEmptyFragment: true,
    includeGpReviewsFragment: true, includeGpReviewsHighlightBannerFragment: true,
    includeGpTitleFragment: true,
    includePdpMigrationAmenitiesFragment: false, includePdpMigrationBookItFloatingFooterFragment: false,
    includePdpMigrationBookItNavFragment: false, includePdpMigrationBookItNonExperiencedGuestFragment: false,
    includePdpMigrationDescriptionFragment: false, includePdpMigrationHeroFragment: false,
    includePdpMigrationHighlightsFragment: true, includePdpMigrationLocationPdpFragment: false,
    includePdpMigrationMarqueeBookItFloatingFooterFragment: false, includePdpMigrationMarqueeBookItNavFragment: false,
    includePdpMigrationMarqueeBookItSidebarFragment: false, includePdpMigrationMeetYourHostFragment: false,
    includePdpMigrationNavFragment: false, includePdpMigrationNavMobileFragment: false,
    includePdpMigrationOverviewV2Fragment: false, includePdpMigrationPoliciesFragment: false,
    includePdpMigrationReportToAirbnbFragment: false, includePdpMigrationReviewsEmptyFragment: false,
    includePdpMigrationReviewsFragment: false, includePdpMigrationReviewsHighlightBannerFragment: false,
    includePdpMigrationTitleFragment: false,
  }
}

/** Build the API URL for a given hash, listing ID, and include variables */
function buildApiUrl(hash: string, listingId: string, includeVars: Record<string, boolean>): string {
  const id = Buffer.from(`StayListing:${listingId}`).toString('base64')
  const demandId = Buffer.from(`DemandStayListing:${listingId}`).toString('base64')
  const variables = {
    amenityIds: null, categoryTag: null, dateRange: null,
    demandStayListingId: demandId, federatedSearchId: null, guestCounts: null,
    id,
    ...includeVars,
    numberOfAdults: null, numberOfChildren: null, numberOfInfants: null, numberOfPets: null,
    p3ImpressionId: null, photoId: null,
    pdpSectionsRequest: { adults: '1', layouts: ['SIDEBAR', 'SINGLE_COLUMN'] },
  }
  const extensions = { persistedQuery: { version: 1, sha256Hash: hash } }
  return `https://www.airbnb.com/api/v3/StaysPdpSections/${hash}?operationName=StaysPdpSections&locale=en&currency=USD&variables=${encodeURIComponent(JSON.stringify(variables))}&extensions=${encodeURIComponent(JSON.stringify(extensions))}`
}

/** Extract listing data from an API JSON response string */
function extractFromApiResponse(dataStr: string) {
  // Extract title — prefer listingTitle (host-written) over generic "title" fields
  let title = ''
  const listingTitleMatch = dataStr.match(/"listingTitle":\s*"([^"]{5,200})"/)
  if (listingTitleMatch) {
    title = listingTitleMatch[1]
  } else {
    const titleMatch = dataStr.match(/"title":\s*"([^"]{5,100})"/)
    if (titleMatch) title = titleMatch[1]
  }

  // Extract description
  let description = ''
  const descPatterns = [
    /"htmlDescription":\s*\{[^}]*"htmlText":\s*"([^"]+)"/,
    /"description":\s*"([^"]{50,})"/,
  ]
  for (const pattern of descPatterns) {
    const match = dataStr.match(pattern)
    if (match) {
      description = match[1]
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<[^>]+>/g, '')
        .replace(/\\n/g, '\n')
        .trim()
      break
    }
  }

  // Extract location — try structured fields first, fall back to subtitle text
  let location = ''
  const locMatch = dataStr.match(/"city":\s*"([^"]+)"/)
  const regionMatch = dataStr.match(/"state":\s*"([^"]+)"/)
  if (locMatch) {
    location = [locMatch[1], regionMatch?.[1]].filter(Boolean).join(', ')
  } else {
    const subtitleMatch = dataStr.match(/"localizedCityName":\s*"([^"]+)"/)
      ?? dataStr.match(/"locationTitle":\s*"([^"]+)"/)
    if (subtitleMatch) location = subtitleMatch[1]
  }

  // Extract rating
  let rating = 0
  const ratingMatch = dataStr.match(/"ratingValue":\s*([\d.]+)/)
    ?? dataStr.match(/"guestSatisfactionOverall":\s*([\d.]+)/)
  if (ratingMatch) rating = parseFloat(ratingMatch[1])

  // Extract review count
  let reviewCount = 0
  const rcMatch = dataStr.match(/"reviewCount":\s*(\d+)/)
    ?? dataStr.match(/"reviewsCount":\s*(\d+)/)
    ?? dataStr.match(/"visibleReviewCount":\s*(\d+)/)
  if (rcMatch) reviewCount = parseInt(rcMatch[1])

  // Extract amenities
  let amenities: string[] = []
  const amenityMatches = dataStr.match(/"title":\s*"([^"]{2,50})"/g)
  if (amenityMatches) {
    const found = amenityMatches
      .map(m => m.match(/"title":\s*"([^"]+)"/)?.[1] ?? '')
      .filter(a => a && !a.includes('\\') && isLikelyAmenity(a))
    amenities = Array.from(new Set(found)).slice(0, 50)
  }

  // Extract reviews
  let reviews: string[] = []
  const reviewMatches = dataStr.match(/"comments":\s*"([^"]{15,250})"/g)
  if (reviewMatches) {
    reviews = reviewMatches
      .map(m => m.match(/"comments":\s*"([^"]+)"/)?.[1] ?? '')
      .filter(r => r.length > 15)
      .slice(0, 12)
  }

  // Extract photo URLs and count
  let photoCount = 0
  let photoUrls: string[] = []
  const photoMatches = dataStr.match(/"baseUrl":\s*"(https:\/\/a0\.muscache\.com\/im\/[^"]+)"/g)
  if (photoMatches) {
    const uniqueUrls = Array.from(new Set(
      photoMatches.map(m => m.match(/"baseUrl":\s*"([^"]+)"/)?.[1] ?? '').filter(Boolean)
    ))
    photoUrls = uniqueUrls.slice(0, 10)
    photoCount = uniqueUrls.length
  }

  return { title, description, location, rating, reviewCount, amenities, reviews, photoCount, photoUrls }
}

/**
 * API-based scraper — uses Airbnb's public StaysPdpSections endpoint.
 * Self-healing: when the persisted query hash rotates, automatically
 * discovers the current hash from the listing page's JS bundle.
 */
async function apiScrape(url: string): Promise<ScrapedListing> {
  const base: ScrapedListing = {
    url,
    isDemo: false,
    scrapedAt: new Date().toISOString(),
    scrapeSuccess: false,
  }

  const listingId = extractListingId(url)
  if (!listingId) {
    return { ...base, scrapeError: 'Could not extract listing ID from URL' }
  }

  const API_KEY = process.env.AIRBNB_API_KEY
  if (!API_KEY) {
    return { ...base, scrapeError: 'AIRBNB_API_KEY is not configured' }
  }

  const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  const headers = { 'User-Agent': UA, 'X-Airbnb-Api-Key': API_KEY, 'Content-Type': 'application/json' }

  // Use cached hash if available, otherwise start with fallback
  const currentHash = cachedApiHash?.hash ?? FALLBACK_HASH
  const currentVars = cachedApiHash?.includeVars ?? defaultIncludeVars()

  try {
    const apiUrl = buildApiUrl(currentHash, listingId, currentVars)
    const res = await fetch(apiUrl, { headers })

    // Check for stale hash — Airbnb returns 400 with PersistedQueryNotFound
    // or 200 with a GraphQL validation error when the hash rotates
    const isStaleHash = res.status === 400 ||
      (res.status === 200 && res.headers.get('content-length') && parseInt(res.headers.get('content-length')!) < 300)

    if (isStaleHash) {
      // Read body to check for PersistedQueryNotFound / ValidationError
      const body = await res.text()
      if (body.includes('PersistedQueryNotFound') || body.includes('ValidationError')) {
        console.warn(`[scraper:api] Stale hash detected, discovering new hash...`)
        const discovered = await discoverApiHash(url)
        if (discovered) {
          cachedApiHash = discovered
          // Retry with the discovered hash
          const retryUrl = buildApiUrl(discovered.hash, listingId, discovered.includeVars)
          const retryRes = await fetch(retryUrl, { headers })
          if (!retryRes.ok) {
            return { ...base, scrapeError: `API HTTP ${retryRes.status} after hash discovery` }
          }
          const json = await retryRes.json()
          const dataStr = JSON.stringify(json)
          const extracted = extractFromApiResponse(dataStr)
          if (!extracted.title && !extracted.description) {
            return { ...base, scrapeError: 'API returned no listing data after hash discovery' }
          }
          return { ...base, ...extracted, scrapeSuccess: true }
        }
        return { ...base, scrapeError: 'Hash rotated and discovery failed' }
      }
      // Some other error
      return { ...base, scrapeError: `API HTTP ${res.status}` }
    }

    if (!res.ok) {
      console.warn(`[scraper:api] API returned ${res.status}`)
      return { ...base, scrapeError: `API HTTP ${res.status}` }
    }

    const json = await res.json()
    const dataStr = JSON.stringify(json)
    const extracted = extractFromApiResponse(dataStr)

    if (!extracted.title && !extracted.description) {
      return { ...base, scrapeError: 'API returned no listing data' }
    }

    return { ...base, ...extracted, scrapeSuccess: true }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[scraper:api] Failed:', msg)
    return { ...base, scrapeError: msg }
  }
}

/**
 * HTML fetch-based scraper — extracts from meta tags and embedded JSON.
 * Fallback if API scrape fails.
 */
async function fetchScrape(url: string): Promise<ScrapedListing> {
  const base: ScrapedListing = {
    url,
    isDemo: false,
    scrapedAt: new Date().toISOString(),
    scrapeSuccess: false,
  }

  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
    },
    redirect: 'follow',
  })

  if (!res.ok) {
    return { ...base, scrapeError: `HTTP ${res.status}` }
  }

  const html = await res.text()

  // --- Extract title ---
  // Prefer listingTitle from embedded data, then <title> tag (has host title), og:title last (auto-generated)
  let title = ''
  const listingTitleMatch = html.match(/"listingTitle":\s*"([^"]{5,200})"/)
  if (listingTitleMatch) {
    title = listingTitleMatch[1]
  } else {
    const pageTitleMatch = html.match(/<title>([^<]+)<\/title>/i)
    if (pageTitleMatch) {
      title = pageTitleMatch[1].replace(/\s*-\s*.*Airbnb.*$/i, '').trim()
    } else {
      const ogTitleMatch = html.match(/<meta\s+property="og:title"\s+content="([^"]+)"/i)
      title = ogTitleMatch?.[1]?.replace(/\s*[-·|].*Airbnb.*$/i, '').trim() ?? ''
    }
  }

  const descMatch = html.match(/<meta\s+property="og:description"\s+content="([^"]+)"/i)
    ?? html.match(/<meta\s+name="description"\s+content="([^"]+)"/i)
  const metaDescription = descMatch?.[1]?.trim() ?? ''

  // --- Extract from JSON-LD ---
  let jsonLdData: Record<string, unknown> = {}
  const jsonLdMatch = html.match(/<script\s+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/i)
  if (jsonLdMatch) {
    try { jsonLdData = JSON.parse(jsonLdMatch[1]) } catch {}
  }

  let description = ''
  let amenities: string[] = []
  let rating = 0
  let reviewCount = 0
  let reviews: string[] = []
  let photoCount = 0
  let photoUrls: string[] = []
  let location = ''

  // Try deferred state script tags
  const dataScripts = html.match(/<script[^>]*id="data-deferred-state[^"]*"[^>]*>([\s\S]*?)<\/script>/gi) ?? []

  for (const scriptTag of dataScripts) {
    const jsonMatch = scriptTag.match(/>([\s\S]*?)<\/script>/i)
    if (!jsonMatch) continue
    try {
      const data = JSON.parse(jsonMatch[1])
      const dataStr = JSON.stringify(data)

      // Extract host-written title from deferred state
      if (!title) {
        const lt = dataStr.match(/"listingTitle":\s*"([^"]{5,200})"/)
        if (lt) title = lt[1]
      }

      if (!description) {
        const descPatterns = [
          /"htmlDescription":\s*\{[^}]*"htmlText":\s*"([^"]+)"/,
          /"description":\s*"([^"]{50,})"/,
        ]
        for (const pattern of descPatterns) {
          const match = dataStr.match(pattern)
          if (match) {
            description = match[1].replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').replace(/\\n/g, '\n').trim()
            break
          }
        }
      }

      if (!amenities.length) {
        const amenityMatches = dataStr.match(/"title":\s*"([^"]{2,50})"/g)
        if (amenityMatches) {
          amenities = Array.from(new Set(
            amenityMatches.map(m => m.match(/"title":\s*"([^"]+)"/)?.[1] ?? '').filter(a => a && isLikelyAmenity(a))
          )).slice(0, 50)
        }
      }

      if (!rating) {
        const rm = dataStr.match(/"ratingValue":\s*([\d.]+)/) ?? dataStr.match(/"guestSatisfactionOverall":\s*([\d.]+)/)
        if (rm) rating = parseFloat(rm[1])
      }

      if (!reviewCount) {
        const rc = dataStr.match(/"reviewCount":\s*(\d+)/) ?? dataStr.match(/"visibleReviewCount":\s*(\d+)/)
        if (rc) reviewCount = parseInt(rc[1])
      }

      if (!reviews.length) {
        const rm = dataStr.match(/"comments":\s*"([^"]{15,250})"/g)
        if (rm) reviews = rm.map(m => m.match(/"comments":\s*"([^"]+)"/)?.[1] ?? '').filter(r => r.length > 15).slice(0, 12)
      }

      if (!photoCount) {
        const pm = dataStr.match(/"baseUrl":\s*"(https:\/\/a0\.muscache\.com\/im\/[^"]+)"/g)
        if (pm) {
          const uniqueUrls = Array.from(new Set(
            pm.map(m => m.match(/"baseUrl":\s*"([^"]+)"/)?.[1] ?? '').filter(Boolean)
          ))
          if (!photoUrls.length) {
            photoUrls = uniqueUrls.slice(0, 10)
          }
          photoCount = uniqueUrls.length
        }
      }
    } catch {}
  }

  // JSON-LD fallbacks
  if (!description && typeof jsonLdData.description === 'string') description = jsonLdData.description
  if (!rating && typeof jsonLdData.aggregateRating === 'object' && jsonLdData.aggregateRating) {
    const ar = jsonLdData.aggregateRating as Record<string, unknown>
    if (ar.ratingValue) rating = parseFloat(String(ar.ratingValue))
    if (ar.reviewCount) reviewCount = parseInt(String(ar.reviewCount))
  }
  if (typeof jsonLdData.address === 'object' && jsonLdData.address) {
    const addr = jsonLdData.address as Record<string, string>
    location = [addr.addressLocality, addr.addressRegion, addr.addressCountry].filter(Boolean).join(', ')
  }
  if (!description && metaDescription) description = metaDescription
  if (!photoCount) {
    // Count unique muscache URLs as a rough photo count estimate
    const imgMatches = html.match(/https:\/\/a0\.muscache\.com\/im\/[^"'\s)]+/g)
    photoCount = imgMatches ? new Set(imgMatches).size : 0
  }

  if (!title && !description) {
    return { ...base, scrapeError: 'Could not extract listing data from page' }
  }

  return { ...base, title, location, description, photoCount, photoUrls, rating, reviewCount, amenities, reviews, scrapeSuccess: true }
}


/**
 * Apify-based scraper — uses a managed Airbnb scraper actor.
 * Most reliable at scale, handles anti-bot measures.
 */
async function apifyScrape(url: string): Promise<ScrapedListing> {
  const base: ScrapedListing = {
    url,
    isDemo: false,
    scrapedAt: new Date().toISOString(),
    scrapeSuccess: false,
  }

  const token = process.env.APIFY_API_TOKEN
  if (!token) {
    return { ...base, scrapeError: 'APIFY_API_TOKEN not configured' }
  }

  try {
    const client = new ApifyClient({ token })

    // Use the tri_angle Airbnb scraper actor (most maintained community actor)
    const run = await client.actor('tri_angle/airbnb-scraper').call({
      startUrls: [{ url }],
      maxListings: 1,
      includeReviews: true,
      maxReviews: 12,
      simple: false,
      currency: 'USD',
      proxyConfiguration: { useApifyProxy: true },
    }, {
      timeout: 120, // seconds — single listing typically takes 30-90s
      memory: 256,
    })

    const { items } = await client.dataset(run.defaultDatasetId).listItems({ limit: 1 })

    if (!items.length) {
      return { ...base, scrapeError: 'Apify returned no results' }
    }

    const item = items[0] as Record<string, unknown>

    const title = (item.name as string) || ''
    const description = (item.description as string) || ''
    const location = [item.city, item.state, item.country].filter(Boolean).join(', ')
    const rating = typeof item.stars === 'number' ? item.stars
      : typeof item.rating === 'number' ? item.rating : 0
    const reviewCount = typeof item.reviewsCount === 'number' ? (item.reviewsCount as number) : 0
    const photoCount = Array.isArray(item.photos) ? (item.photos as unknown[]).length : 0
    let photoUrls: string[] = []
    if (Array.isArray(item.photos)) {
      photoUrls = (item.photos as Record<string, unknown>[])
        .map(p => (p.pictureUrl as string) || (p.url as string) || (p.baseUrl as string) || '')
        .filter(Boolean)
        .slice(0, 10)
    }

    // Extract amenities
    let amenities: string[] = []
    if (Array.isArray(item.amenities)) {
      amenities = (item.amenities as string[]).filter(a => typeof a === 'string' && isLikelyAmenity(a)).slice(0, 50)
    }

    // Extract reviews
    let reviews: string[] = []
    if (Array.isArray(item.reviews)) {
      reviews = (item.reviews as Record<string, unknown>[])
        .map(r => (r.comments as string) || (r.text as string) || '')
        .filter(r => r.length > 15)
        .slice(0, 12)
    }

    if (!title && !description) {
      return { ...base, scrapeError: 'Apify returned empty listing data' }
    }

    return {
      ...base,
      title,
      location,
      description,
      photoCount,
      photoUrls,
      rating,
      reviewCount,
      amenities,
      reviews,
      scrapeSuccess: true,
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[scraper:apify] Failed:', msg)
    return { ...base, scrapeError: msg }
  }
}

/**
 * Main scraper entry point — 3-tier fallback ordered by speed:
 *
 * 1. API-based (Airbnb public GraphQL — fast, self-healing hash discovery)
 * 2. Apify (managed scraper — reliable but slower, ~30-90s per listing)
 * 3. HTML fetch fallback (catches cases where both above fail)
 *
 * To activate Apify: rent the tri_angle/airbnb-scraper actor on your Apify
 * account, then set APIFY_ENABLED=true and APIFY_API_TOKEN in Railway env vars.
 */
export async function scrapeAirbnbListing(url: string): Promise<ScrapedListing> {
  // Tier 1: API-based (fast — ~200ms when hash is current)
  const apiResult = await apiScrape(url)
  if (apiResult.scrapeSuccess) {
    return apiResult
  }
  console.warn('[scraper] API scrape failed:', apiResult.scrapeError)

  // Tier 2: Apify — reliable but slower, only when explicitly enabled
  if (process.env.APIFY_ENABLED === 'true' && process.env.APIFY_API_TOKEN) {
    const apifyResult = await apifyScrape(url)
    if (apifyResult.scrapeSuccess) {
      return apifyResult
    }
    console.warn('[scraper] Apify scrape failed:', apifyResult.scrapeError)
  }

  // Tier 3: HTML fetch fallback
  const fetchResult = await fetchScrape(url)
  if (fetchResult.scrapeSuccess) {
    return fetchResult
  }
  console.warn('[scraper] Fetch scrape failed:', fetchResult.scrapeError)

  return fetchResult
}
