/**
 * Airbnb listing scraper.
 *
 * Primary: fetch-based (works on Vercel serverless)
 * Fallback: Playwright (local dev only)
 */

import { ListingInput } from '../types'
export { isValidAirbnbUrl } from '../validation'

export interface ScrapedListing extends ListingInput {
  scrapedAt: string
  scrapeSuccess: boolean
  scrapeError?: string
}

/**
 * Fetch-based scraper — extracts listing data from Airbnb's server-rendered HTML.
 * Works on Vercel without Playwright.
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

  // --- Extract from meta tags ---
  const titleMatch = html.match(/<meta\s+property="og:title"\s+content="([^"]+)"/i)
    ?? html.match(/<title>([^<]+)<\/title>/i)
  const title = titleMatch?.[1]?.replace(/\s*[-·|].*Airbnb.*$/i, '').trim() ?? ''

  const descMatch = html.match(/<meta\s+property="og:description"\s+content="([^"]+)"/i)
    ?? html.match(/<meta\s+name="description"\s+content="([^"]+)"/i)
  const metaDescription = descMatch?.[1]?.trim() ?? ''

  // --- Extract from JSON-LD structured data ---
  let jsonLdData: Record<string, unknown> = {}
  const jsonLdMatch = html.match(/<script\s+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/i)
  if (jsonLdMatch) {
    try {
      jsonLdData = JSON.parse(jsonLdMatch[1])
    } catch { /* ignore parse errors */ }
  }

  // --- Extract from Airbnb's embedded data (deferred state) ---
  let description = ''
  let amenities: string[] = []
  let rating = 0
  let reviewCount = 0
  let reviews: string[] = []
  let photoCount = 0
  let location = ''

  // Try to find Airbnb's bootstrapped data in script tags
  const dataScripts = html.match(/<script[^>]*id="data-deferred-state[^"]*"[^>]*>([\s\S]*?)<\/script>/gi)
    ?? html.match(/<script\s+type="application\/json"[^>]*data-state[^>]*>([\s\S]*?)<\/script>/gi)
    ?? []

  for (const scriptTag of dataScripts) {
    const jsonMatch = scriptTag.match(/>([\s\S]*?)<\/script>/i)
    if (!jsonMatch) continue
    try {
      const data = JSON.parse(jsonMatch[1])
      const dataStr = JSON.stringify(data)

      // Extract description from nested data
      if (!description) {
        const descPatterns = [
          /"htmlDescription":\s*\{[^}]*"htmlText":\s*"([^"]+)"/,
          /"description":\s*"([^"]{50,})"/,
          /"sectioned_description"[\s\S]*?"body":\s*"([^"]+)"/,
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
      }

      // Extract amenities
      if (!amenities.length) {
        const amenityMatches = dataStr.match(/"title":\s*"([^"]{2,50})"/g)
        if (amenityMatches) {
          const found = amenityMatches
            .map(m => m.match(/"title":\s*"([^"]+)"/)?.[1] ?? '')
            .filter(a => a && !a.includes('\\') && a.length > 1 && a.length < 50)
          amenities = Array.from(new Set(found)).slice(0, 50)
        }
      }

      // Extract rating
      if (!rating) {
        const ratingMatch = dataStr.match(/"ratingValue":\s*([\d.]+)/)
          ?? dataStr.match(/"guestSatisfactionOverall":\s*([\d.]+)/)
          ?? dataStr.match(/"rating":\s*([\d.]+)/)
        if (ratingMatch) rating = parseFloat(ratingMatch[1])
      }

      // Extract review count
      if (!reviewCount) {
        const rcMatch = dataStr.match(/"reviewCount":\s*(\d+)/)
          ?? dataStr.match(/"reviewsCount":\s*(\d+)/)
          ?? dataStr.match(/"visibleReviewCount":\s*(\d+)/)
        if (rcMatch) reviewCount = parseInt(rcMatch[1])
      }

      // Extract reviews
      if (!reviews.length) {
        const reviewMatches = dataStr.match(/"comments":\s*"([^"]{15,250})"/g)
          ?? dataStr.match(/"reviewText":\s*"([^"]{15,250})"/g)
        if (reviewMatches) {
          reviews = reviewMatches
            .map(m => {
              const match = m.match(/"(?:comments|reviewText)":\s*"([^"]+)"/)
              return match?.[1] ?? ''
            })
            .filter(r => r.length > 15)
            .slice(0, 12)
        }
      }

      // Extract photo count
      if (!photoCount) {
        const photoMatches = dataStr.match(/"baseUrl":\s*"https:\/\/a0\.muscache\.com[^"]+"/g)
          ?? dataStr.match(/"picture":\s*"[^"]+"/g)
        if (photoMatches) photoCount = photoMatches.length
      }

    } catch { /* ignore parse errors for individual script blocks */ }
  }

  // Use JSON-LD data as fallback
  if (!title && jsonLdData.name) {
    // title already set above from meta
  }
  if (!description && typeof jsonLdData.description === 'string') {
    description = jsonLdData.description
  }
  if (!rating && typeof jsonLdData.aggregateRating === 'object' && jsonLdData.aggregateRating) {
    const ar = jsonLdData.aggregateRating as Record<string, unknown>
    if (ar.ratingValue) rating = parseFloat(String(ar.ratingValue))
    if (ar.reviewCount) reviewCount = parseInt(String(ar.reviewCount))
  }
  if (typeof jsonLdData.address === 'object' && jsonLdData.address) {
    const addr = jsonLdData.address as Record<string, string>
    location = [addr.addressLocality, addr.addressRegion, addr.addressCountry].filter(Boolean).join(', ')
  }

  // Fallback: use meta description if no full description found
  if (!description && metaDescription) {
    description = metaDescription
  }

  // Count photos from HTML if not found in JSON
  if (!photoCount) {
    const imgMatches = html.match(/a0\.muscache\.com/g)
    photoCount = imgMatches ? Math.min(imgMatches.length, 50) : 0
  }

  if (!title && !description) {
    return { ...base, scrapeError: 'Could not extract listing data from page' }
  }

  return {
    ...base,
    title,
    location,
    description,
    photoCount,
    rating,
    reviewCount,
    amenities,
    reviews,
    scrapeSuccess: true,
  }
}

/**
 * Playwright-based scraper — richer extraction but requires Playwright.
 * Only works locally, not on Vercel.
 */
async function playwrightScrape(url: string): Promise<ScrapedListing> {
  const base: ScrapedListing = {
    url,
    isDemo: false,
    scrapedAt: new Date().toISOString(),
    scrapeSuccess: false,
  }

  let browser
  try {
    const { chromium } = await import('playwright')
    browser = await chromium.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-blink-features=AutomationControlled',
      ],
    })

    const context = await browser.newContext({
      userAgent:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      locale: 'en-US',
      viewport: { width: 1280, height: 800 },
    })

    const page = await context.newPage()
    await page.route('**/*.{png,jpg,jpeg,gif,webp,svg,woff,woff2,ttf}', route => route.abort())
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 })
    await page.waitForSelector('h1', { timeout: 15000 })

    // Expand hidden sections
    try {
      const showMoreBtn = page.locator('button:has-text("Show more"), button:has-text("Read more"), [data-testid="pdp-show-all-description-btn"]').first()
      if (await showMoreBtn.isVisible({ timeout: 3000 })) {
        await showMoreBtn.click()
        await page.waitForTimeout(1000)
      }
    } catch {}

    try {
      const showAmenitiesBtn = page.locator('button:has-text("Show all"), [data-testid="pdp-show-all-amenities-btn"]').first()
      if (await showAmenitiesBtn.isVisible({ timeout: 3000 })) {
        await showAmenitiesBtn.click()
        await page.waitForTimeout(1500)
      }
    } catch {}

    const data = await page.evaluate(() => {
      const getText = (sel: string) => document.querySelector(sel)?.textContent?.trim() ?? ''
      const getFirst = (...sels: string[]) => {
        for (const sel of sels) {
          const text = document.querySelector(sel)?.textContent?.trim()
          if (text) return text
        }
        return ''
      }

      const title = getText('h1')
      const location = getFirst(
        '[data-testid="listing-page-title-breadcrumb"]',
        '[data-section-id="TITLE_DEFAULT"] span',
        '._heot89', '._152qbzi',
      )

      const descriptionEl =
        document.querySelector('[data-testid="listing-description"] div') ??
        document.querySelector('[data-testid="listing-page-summary"]') ??
        document.querySelector('[aria-label="About this space"]') ??
        document.querySelector('section[aria-label="About this space"] span') ??
        document.querySelector('[data-section-id="DESCRIPTION_DEFAULT"] section span') ??
        document.querySelector('._1gjypya') ??
        document.querySelector('[data-plugin-in-point-id="DESCRIPTION_DEFAULT"] span')
      const description = descriptionEl?.textContent?.trim() ?? ''

      const photoEls = document.querySelectorAll(
        '[data-testid="photo-viewer-section"] img, [data-testid="photo-viewer"] img, ._gig1e7 img, [data-section-id="HERO_DEFAULT"] img'
      )
      const photoCount = photoEls.length || 0

      const ratingText = getFirst(
        '[data-testid="listing-page-rating"]', '[data-testid="pdp-reviews-highlight-banner-host-rating"] span',
        '._17p6nbba', '._12si43g',
      )
      const ratingMatch = ratingText.match(/[\d.]+/)
      const rating = ratingMatch ? parseFloat(ratingMatch[0]) : 0

      const reviewText = getFirst(
        '[data-testid="listing-page-review-count"]', '[data-testid="pdp-reviews-highlight-banner-host-review-count"] span',
        '._s65ijh7',
      )
      const reviewCountMatch = reviewText.match(/\d+/)
      const reviewCount = reviewCountMatch ? parseInt(reviewCountMatch[0]) : 0

      const modalAmenityEls = document.querySelectorAll(
        '[data-testid="amenity-row"], [data-testid="modal-container"] [data-testid="amenity-row"]'
      )
      let amenities: string[]
      if (modalAmenityEls.length > 0) {
        amenities = Array.from(modalAmenityEls).map(el => el.textContent?.trim()).filter((t): t is string => !!t && t.length > 1)
      } else {
        const fallbackEls = document.querySelectorAll(
          '._aujnou ._10fy1f8 span, ._11jhslp span, [data-section-id="AMENITIES_DEFAULT"] div[role="listitem"] span'
        )
        amenities = Array.from(fallbackEls).map(el => el.textContent?.trim()).filter((t): t is string => !!t && t.length > 1)
      }
      amenities = Array.from(new Set(amenities)).slice(0, 50)

      const highlightEls = document.querySelectorAll(
        '[data-testid="listing-card-subtitle"] span, [data-section-id="HIGHLIGHTS_DEFAULT"] span, [data-section-id="HIGHLIGHTS_DEFAULT"] h3, [data-testid="pdp-listing-highlights"] span'
      )
      const highlights = Array.from(highlightEls).map(el => el.textContent?.trim()).filter((t): t is string => !!t && t.length > 1)

      const houseRulesEls = document.querySelectorAll(
        '[data-section-id="POLICIES_DEFAULT"] span, [data-testid="house-rules"] span, [data-testid="check-in-time"] span'
      )
      const houseRules = Array.from(houseRulesEls).map(el => el.textContent?.trim()).filter((t): t is string => !!t && t.length > 1)

      const reviewEls = document.querySelectorAll(
        '[data-testid="review-card"] span, [data-testid="pdp-reviews-modal-scrollable-panel"] span, [data-testid="review-section"] span, [data-section-id="REVIEWS_DEFAULT"] span'
      )
      const reviews = Array.from(reviewEls).map(el => el.textContent?.trim()).filter((t): t is string => !!t && t.length > 10 && t.length < 300).slice(0, 12)

      return { title, location, description, photoCount, rating, reviewCount, amenities, highlights, houseRules, reviews }
    })

    try {
      const closeBtn = page.locator('[data-testid="modal-container"] button[aria-label="Close"], button[aria-label="Close"]').first()
      if (await closeBtn.isVisible({ timeout: 1000 })) await closeBtn.click()
    } catch {}

    await browser.close()

    const enrichedAmenities = Array.from(new Set([
      ...(data.amenities || []),
      ...(data.highlights || []),
      ...(data.houseRules || []),
    ])).filter(a => a.length > 1)

    return {
      ...base,
      title: data.title,
      location: data.location,
      description: data.description,
      photoCount: data.photoCount,
      rating: data.rating,
      reviewCount: data.reviewCount,
      amenities: enrichedAmenities,
      reviews: data.reviews,
      scrapeSuccess: true,
    }
  } catch (err) {
    if (browser) await browser.close().catch(() => {})
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[scraper:playwright] Failed:', msg)
    return { ...base, scrapeSuccess: false, scrapeError: msg }
  }
}

/**
 * Main scraper entry point.
 * Tries fetch-based scraping first (works on Vercel),
 * falls back to Playwright locally if fetch fails.
 */
export async function scrapeAirbnbListing(url: string): Promise<ScrapedListing> {
  // Try fetch-based scraping first (works everywhere)
  console.log('[scraper] Trying fetch-based scrape...')
  const fetchResult = await fetchScrape(url)
  if (fetchResult.scrapeSuccess) {
    console.log('[scraper] Fetch scrape succeeded:', fetchResult.title)
    return fetchResult
  }
  console.warn('[scraper] Fetch scrape failed:', fetchResult.scrapeError)

  // Fall back to Playwright (local dev only)
  console.log('[scraper] Trying Playwright fallback...')
  const pwResult = await playwrightScrape(url)
  if (pwResult.scrapeSuccess) {
    console.log('[scraper] Playwright scrape succeeded:', pwResult.title)
    return pwResult
  }
  console.warn('[scraper] Playwright fallback failed:', pwResult.scrapeError)

  return pwResult
}
