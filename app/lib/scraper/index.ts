/**
 * Airbnb listing scraper with 3-tier fallback.
 *
 * 1. Apify (tri_angle/airbnb-scraper) — dormant until actor is rented
 * 2. apiScrape — Airbnb's public GraphQL API (current primary in production)
 * 3. fetchScrape — HTML parse fallback (different failure mode than tier 2)
 */

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

/** Rotate User-Agents to reduce chance of IP-based blocking from datacenters */
const USER_AGENTS = [
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.0',
]
function randomUA(): string { return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)] }

/** Sleep for a given number of milliseconds */
function sleep(ms: number): Promise<void> { return new Promise(r => setTimeout(r, ms)) }

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
        'User-Agent': randomUA(),
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

  const headers = { 'User-Agent': randomUA(), 'X-Airbnb-Api-Key': API_KEY, 'Content-Type': 'application/json' }

  // Use cached hash if available, otherwise start with fallback
  const currentHash = cachedApiHash?.hash ?? FALLBACK_HASH
  const currentVars = cachedApiHash?.includeVars ?? defaultIncludeVars()

  try {
    const apiUrl = buildApiUrl(currentHash, listingId, currentVars)
    console.log(`[scraper:api] Fetching listing ${listingId} with hash ${currentHash.substring(0, 12)}...`)
    const res = await fetch(apiUrl, { headers })
    console.log(`[scraper:api] Response: ${res.status}, content-length: ${res.headers?.get?.('content-length') ?? 'unknown'}`)

    // Check for stale hash — Airbnb returns 400 with PersistedQueryNotFound
    // or 200 with a GraphQL validation error when the hash rotates
    const contentLength = res.headers?.get?.('content-length')
    const isStaleHash = res.status === 400 ||
      (res.status === 200 && contentLength && parseInt(contentLength) < 300)

    if (isStaleHash) {
      // Read body to check for PersistedQueryNotFound / ValidationError
      const body = await res.text()
      console.log(`[scraper:api] Stale hash body preview: ${body.substring(0, 200)}`)
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
      const errBody = await res.text().catch(() => '')
      console.warn(`[scraper:api] API returned ${res.status}: ${errBody.substring(0, 200)}`)
      return { ...base, scrapeError: `API HTTP ${res.status}` }
    }

    const json = await res.json()
    const dataStr = JSON.stringify(json)
    const extracted = extractFromApiResponse(dataStr)

    if (!extracted.title && !extracted.description) {
      console.warn(`[scraper:api] No listing data extracted. Response length: ${dataStr.length}`)
      return { ...base, scrapeError: 'API returned no listing data' }
    }
    console.log(`[scraper:api] Success: "${extracted.title}", ${extracted.photoUrls.length} photos`)

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

  let res: Response
  try {
    res = await fetch(url, {
      headers: {
        'User-Agent': randomUA(),
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      redirect: 'follow',
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { ...base, scrapeError: msg }
  }

  if (!res.ok) {
    return { ...base, scrapeError: `HTTP ${res.status}` }
  }

  const html = await res.text()

  // Detect Airbnb login/block page — datacenter IPs sometimes get redirected
  if (html.length < 15000 && (html.includes('Log in') || html.includes('captcha'))) {
    return { ...base, scrapeError: 'Blocked by Airbnb (login/captcha page)' }
  }

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
 * Apify-based scraper — calls the Apify REST API directly (no SDK needed).
 * Uses the tri_angle/airbnb-scraper actor with residential proxies.
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
    // Start the actor run via REST API
    // Uses tri_angle/airbnb-rooms-urls-scraper (accepts individual listing URLs)
    console.log('[scraper:apify] Starting actor run...')
    const runRes = await fetch(
      `https://api.apify.com/v2/acts/tri_angle~airbnb-rooms-urls-scraper/runs?token=${token}&timeout=120&memory=256`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          startUrls: [{ url }],
          proxyConfiguration: { useApifyProxy: true },
        }),
      }
    )
    if (!runRes.ok) {
      const errText = await runRes.text().catch(() => '')
      return { ...base, scrapeError: `Apify API ${runRes.status}: ${errText.substring(0, 200)}` }
    }
    const run = await runRes.json() as { data?: { id?: string; defaultDatasetId?: string; status?: string } }
    const datasetId = run.data?.defaultDatasetId
    const runId = run.data?.id
    if (!datasetId || !runId) {
      return { ...base, scrapeError: 'Apify run did not return dataset ID' }
    }

    // Poll for run completion (max ~120s)
    for (let i = 0; i < 40; i++) {
      await sleep(3000)
      const statusRes = await fetch(`https://api.apify.com/v2/actor-runs/${runId}?token=${token}`)
      if (!statusRes.ok) continue
      const statusData = await statusRes.json() as { data?: { status?: string } }
      const status = statusData.data?.status
      console.log(`[scraper:apify] Run status: ${status}`)
      if (status === 'SUCCEEDED') break
      if (status === 'FAILED' || status === 'ABORTED' || status === 'TIMED-OUT') {
        return { ...base, scrapeError: `Apify run ${status}` }
      }
    }

    // Fetch results from dataset
    const itemsRes = await fetch(`https://api.apify.com/v2/datasets/${datasetId}/items?token=${token}&limit=1`)
    if (!itemsRes.ok) {
      return { ...base, scrapeError: `Apify dataset fetch failed: ${itemsRes.status}` }
    }
    const items = await itemsRes.json() as Record<string, unknown>[]

    if (!items?.length) {
      return { ...base, scrapeError: 'Apify returned no results' }
    }

    const item = items[0]
    // Log the keys so we can map the schema if it differs
    console.log(`[scraper:apify] Item keys: ${Object.keys(item).join(', ')}`)

    // The rooms-urls-scraper may use different field names than the search scraper.
    // Try multiple possible field names for each data point.
    const title = (item.name as string) || (item.title as string) || (item.listingTitle as string) || ''
    const description = (item.description as string) || (item.aboutSpace as string) || ''
    const location = (item.address as string)
      || [item.city, item.state, item.country].filter(Boolean).join(', ')
      || ''
    const rating = typeof item.stars === 'number' ? item.stars
      : typeof item.rating === 'number' ? item.rating
      : typeof item.guestSatisfactionOverall === 'number' ? item.guestSatisfactionOverall : 0
    const reviewCount = typeof item.reviewsCount === 'number' ? (item.reviewsCount as number)
      : typeof item.numberOfReviews === 'number' ? (item.numberOfReviews as number) : 0

    // Photos: try multiple field names
    const photosRaw = (item.photos ?? item.images ?? item.pictureUrls ?? []) as unknown[]
    const photoCount = photosRaw.length
    let photoUrls: string[] = []
    if (photosRaw.length) {
      photoUrls = photosRaw
        .map(p => {
          if (typeof p === 'string') return p
          if (typeof p === 'object' && p) {
            const obj = p as Record<string, unknown>
            return (obj.pictureUrl as string) || (obj.url as string) || (obj.baseUrl as string) || ''
          }
          return ''
        })
        .filter(Boolean)
        .slice(0, 10)
    }

    // Extract amenities
    let amenities: string[] = []
    const amenitiesRaw = (item.amenities ?? item.previewAmenities ?? []) as unknown[]
    if (amenitiesRaw.length) {
      amenities = amenitiesRaw
        .map(a => typeof a === 'string' ? a : typeof a === 'object' && a ? ((a as Record<string, unknown>).title as string || '') : '')
        .filter(a => a && isLikelyAmenity(a))
        .slice(0, 50)
    }

    // Extract reviews
    let reviews: string[] = []
    if (Array.isArray(item.reviews)) {
      reviews = (item.reviews as Record<string, unknown>[])
        .map(r => (r.comments as string) || (r.text as string) || (r.comment as string) || '')
        .filter(r => r.length > 15)
        .slice(0, 12)
    }

    console.log(`[scraper:apify] Extracted: title="${title.substring(0, 50)}", photos=${photoCount}, rating=${rating}`)

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

// In-memory scrape cache — avoids re-scraping the same listing within 1 hour
// (e.g. Quick Score → Full Audit upgrade). Keyed by listing ID.
const scrapeCache = new Map<string, { data: ScrapedListing; ts: number }>()
const SCRAPE_CACHE_TTL = 60 * 60_000 // 1 hour

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
  // Check scrape cache first (avoids re-scraping on upgrade flow)
  const listingId = extractListingId(url)
  if (listingId) {
    const cached = scrapeCache.get(listingId)
    if (cached && Date.now() - cached.ts < SCRAPE_CACHE_TTL) {
      console.log(`[scraper] Cache hit for listing ${listingId}`)
      return cached.data
    }
  }

  const cache = (data: ScrapedListing) => {
    if (listingId) scrapeCache.set(listingId, { data, ts: Date.now() })
    return data
  }

  // Tier 1: API-based (fast — ~200ms when hash is current)
  const apiResult = await apiScrape(url)
  if (apiResult.scrapeSuccess) return cache(apiResult)
  const apiErr = apiResult.scrapeError ?? ''
  console.warn('[scraper] API scrape failed:', apiErr)

  // If rate-limited (429), skip HTML fetch too (same IP) — go straight to Apify
  const isRateLimited = apiErr.includes('429')

  if (!isRateLimited) {
    // Tier 2 (when not rate-limited): HTML fetch fallback
    const fetchResult = await fetchScrape(url)
    if (fetchResult.scrapeSuccess) return cache(fetchResult)
    console.warn('[scraper] Fetch scrape failed:', fetchResult.scrapeError)
  } else {
    console.warn('[scraper] Rate-limited (429) — skipping HTML fetch, trying Apify...')
  }

  // Tier 3: Apify — uses residential proxies, bypasses IP blocks
  if (process.env.APIFY_ENABLED === 'true' && process.env.APIFY_API_TOKEN) {
    const apifyResult = await apifyScrape(url)
    if (apifyResult.scrapeSuccess) return cache(apifyResult)
    console.warn('[scraper] Apify scrape failed:', apifyResult.scrapeError)
    return apifyResult
  }

  // Last resort if not rate-limited: retry HTML fetch once after a delay
  if (!isRateLimited) {
    await sleep(3000)
    const retryResult = await fetchScrape(url)
    if (retryResult.scrapeSuccess) return cache(retryResult)
    console.warn('[scraper] Fetch retry failed:', retryResult.scrapeError)
    return retryResult
  }

  return apiResult
}
