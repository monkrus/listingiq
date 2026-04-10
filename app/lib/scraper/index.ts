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

/**
 * API-based scraper — uses Airbnb's public StaysPdpSections endpoint.
 * More reliable from server IPs than HTML scraping.
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

  const API_KEY = 'd306zoyjsyarp7ifhu67rjxn52tv0t20'
  const apiUrl = `https://www.airbnb.com/api/v3/StaysPdpSections/d1d64f8a2ace16cd48e7a88e7e1f12cca413fa53ff4a3c8b5d20e7ec733361d0?operationName=StaysPdpSections&locale=en&currency=USD&variables=%7B%22id%22%3A%22StaysListing%3A${listingId}%22%2C%22pdpSectionsRequest%22%3A%7B%22adults%22%3A%221%22%2C%22layouts%22%3A%5B%22SIDEBAR%22%2C%22SINGLE_COLUMN%22%5D%7D%7D&extensions=%7B%22persistedQuery%22%3A%7B%22version%22%3A1%2C%22sha256Hash%22%3A%22d1d64f8a2ace16cd48e7a88e7e1f12cca413fa53ff4a3c8b5d20e7ec733361d0%22%7D%7D`

  try {
    const res = await fetch(apiUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'X-Airbnb-Api-Key': API_KEY,
        'Content-Type': 'application/json',
      },
    })

    if (!res.ok) {
      console.warn(`[scraper:api] API returned ${res.status}`)
      return { ...base, scrapeError: `API HTTP ${res.status}` }
    }

    const json = await res.json()
    const dataStr = JSON.stringify(json)

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

    // Extract location
    let location = ''
    const locMatch = dataStr.match(/"city":\s*"([^"]+)"/)
    const regionMatch = dataStr.match(/"state":\s*"([^"]+)"/)
    if (locMatch) location = [locMatch[1], regionMatch?.[1]].filter(Boolean).join(', ')

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
    const photoMatches = dataStr.match(/"baseUrl":\s*"(https:\/\/a0\.muscache\.com[^"]+)"/g)
    if (photoMatches) {
      photoUrls = photoMatches
        .map(m => m.match(/"baseUrl":\s*"([^"]+)"/)?.[1] ?? '')
        .filter(Boolean)
      photoUrls = Array.from(new Set(photoUrls)).slice(0, 10)
      photoCount = photoMatches.length
    }

    if (!title && !description) {
      return { ...base, scrapeError: 'API returned no listing data' }
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
        const pm = dataStr.match(/"baseUrl":\s*"(https:\/\/a0\.muscache\.com[^"]+)"/g)
        if (pm) {
          if (!photoUrls.length) {
            photoUrls = pm
              .map(m => m.match(/"baseUrl":\s*"([^"]+)"/)?.[1] ?? '')
              .filter(Boolean)
            photoUrls = Array.from(new Set(photoUrls)).slice(0, 10)
          }
          photoCount = pm.length
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
    const imgMatches = html.match(/a0\.muscache\.com/g)
    photoCount = imgMatches ? Math.min(imgMatches.length, 50) : 0
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
 * Main scraper entry point.
 * 1. Apify (most reliable at scale — requires actor rental on Apify account)
 * 2. API-based (Airbnb public GraphQL — current primary in production)
 * 3. HTML fetch fallback (catches API endpoint failures)
 */
export async function scrapeAirbnbListing(url: string): Promise<ScrapedListing> {
  // Try Apify first (most reliable at scale)
  if (process.env.APIFY_API_TOKEN) {
    const apifyResult = await apifyScrape(url)
    if (apifyResult.scrapeSuccess) {
      return apifyResult
    }
    console.warn('[scraper] Apify scrape failed:', apifyResult.scrapeError)
  }

  const apiResult = await apiScrape(url)
  if (apiResult.scrapeSuccess) {
    return apiResult
  }
  console.warn('[scraper] API scrape failed:', apiResult.scrapeError)

  const fetchResult = await fetchScrape(url)
  if (fetchResult.scrapeSuccess) {
    return fetchResult
  }
  console.warn('[scraper] Fetch scrape failed:', fetchResult.scrapeError)

  return fetchResult
}
