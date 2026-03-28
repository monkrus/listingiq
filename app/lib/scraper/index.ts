/**
 * Airbnb listing scraper using Playwright.
 * Runs server-side only — never in the browser.
 *
 * Install: npm install playwright
 * First run: npx playwright install chromium
 */

import { ListingInput } from '../types'
export { isValidAirbnbUrl } from '../validation'

export interface ScrapedListing extends ListingInput {
  scrapedAt: string
  scrapeSuccess: boolean
  scrapeError?: string
}

/**
 * Dynamically import playwright so the module doesn't break
 * in environments where it isn't installed yet.
 */
async function getBrowser() {
  const { chromium } = await import('playwright')
  return chromium.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-blink-features=AutomationControlled',
    ],
  })
}

export async function scrapeAirbnbListing(url: string): Promise<ScrapedListing> {
  const base: ScrapedListing = {
    url,
    isDemo: false,
    scrapedAt: new Date().toISOString(),
    scrapeSuccess: false,
  }

  let browser
  try {
    browser = await getBrowser()
    const context = await browser.newContext({
      userAgent:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      locale: 'en-US',
      viewport: { width: 1280, height: 800 },
    })

    const page = await context.newPage()

    // Block images/fonts to speed up scraping
    await page.route('**/*.{png,jpg,jpeg,gif,webp,svg,woff,woff2,ttf}', route => route.abort())

    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 })

    // Wait for the main listing content
    await page.waitForSelector('h1', { timeout: 15000 })

    // --- Expand hidden sections before scraping ---

    // Click "Show more" on the description to get full text
    try {
      const showMoreBtn = page.locator('button:has-text("Show more"), button:has-text("Read more"), [data-testid="pdp-show-all-description-btn"]').first()
      if (await showMoreBtn.isVisible({ timeout: 3000 })) {
        await showMoreBtn.click()
        await page.waitForTimeout(1000)
      }
    } catch { /* description may already be fully visible */ }

    // Click "Show all amenities" to open the full amenity modal
    try {
      const showAmenitiesBtn = page.locator('button:has-text("Show all"), [data-testid="pdp-show-all-amenities-btn"]').first()
      if (await showAmenitiesBtn.isVisible({ timeout: 3000 })) {
        await showAmenitiesBtn.click()
        await page.waitForTimeout(1500)
      }
    } catch { /* amenities may already be fully visible */ }

    const data = await page.evaluate(() => {
      const getText = (sel: string) => document.querySelector(sel)?.textContent?.trim() ?? ''
      const getFirst = (...sels: string[]) => {
        for (const sel of sels) {
          const text = document.querySelector(sel)?.textContent?.trim()
          if (text) return text
        }
        return ''
      }

      // Title
      const title = getText('h1')

      // Location — multiple fallback selectors for Airbnb's changing DOM
      const location = getFirst(
        '[data-testid="listing-page-title-breadcrumb"]',
        '[data-section-id="TITLE_DEFAULT"] span',
        '._heot89',
        '._152qbzi',
      )

      // Description — try the expanded modal first, then inline selectors
      const descriptionEl =
        document.querySelector('[data-testid="listing-description"] div') ??
        document.querySelector('[data-testid="listing-page-summary"]') ??
        document.querySelector('[aria-label="About this space"]') ??
        document.querySelector('section[aria-label="About this space"] span') ??
        document.querySelector('[data-section-id="DESCRIPTION_DEFAULT"] section span') ??
        document.querySelector('._1gjypya') ??
        document.querySelector('[data-plugin-in-point-id="DESCRIPTION_DEFAULT"] span')
      const description = descriptionEl?.textContent?.trim() ?? ''

      // Photo count — count img elements in the photo grid
      const photoEls = document.querySelectorAll(
        '[data-testid="photo-viewer-section"] img, ' +
        '[data-testid="photo-viewer"] img, ' +
        '._gig1e7 img, ' +
        '[data-section-id="HERO_DEFAULT"] img'
      )
      const photoCount = photoEls.length || 0

      // Rating — multiple fallbacks
      const ratingText = getFirst(
        '[data-testid="listing-page-rating"]',
        '[data-testid="pdp-reviews-highlight-banner-host-rating"] span',
        '._17p6nbba',
        '._12si43g',
      )
      const ratingMatch = ratingText.match(/[\d.]+/)
      const rating = ratingMatch ? parseFloat(ratingMatch[0]) : 0

      // Review count — multiple fallbacks
      const reviewText = getFirst(
        '[data-testid="listing-page-review-count"]',
        '[data-testid="pdp-reviews-highlight-banner-host-review-count"] span',
        '._s65ijh7',
      )
      const reviewCountMatch = reviewText.match(/\d+/)
      const reviewCount = reviewCountMatch ? parseInt(reviewCountMatch[0]) : 0

      // Amenities — try modal first (full list), then inline
      const modalAmenityEls = document.querySelectorAll(
        '[data-testid="amenity-row"], ' +
        '[data-testid="modal-container"] [data-testid="amenity-row"]'
      )
      // Grab text from amenity rows, falling back to broad selectors
      let amenities: string[]
      if (modalAmenityEls.length > 0) {
        amenities = Array.from(modalAmenityEls)
          .map(el => el.textContent?.trim())
          .filter((t): t is string => !!t && t.length > 1)
      } else {
        const fallbackEls = document.querySelectorAll(
          '._aujnou ._10fy1f8 span, ._11jhslp span, ' +
          '[data-section-id="AMENITIES_DEFAULT"] div[role="listitem"] span'
        )
        amenities = Array.from(fallbackEls)
          .map(el => el.textContent?.trim())
          .filter((t): t is string => !!t && t.length > 1)
      }
      // Deduplicate and cap
      amenities = Array.from(new Set(amenities)).slice(0, 50)

      // Listing highlights (e.g. "Self check-in", "Superhost", "Guest favorite")
      // These appear as badges/highlights above the description and contain key signals
      const highlightEls = document.querySelectorAll(
        '[data-testid="listing-card-subtitle"] span, ' +
        '[data-section-id="HIGHLIGHTS_DEFAULT"] span, ' +
        '[data-section-id="HIGHLIGHTS_DEFAULT"] h3, ' +
        '[data-testid="pdp-listing-highlights"] span'
      )
      const highlights = Array.from(highlightEls)
        .map(el => el.textContent?.trim())
        .filter((t): t is string => !!t && t.length > 1)

      // House rules / check-in method (captures self check-in info)
      const houseRulesEls = document.querySelectorAll(
        '[data-section-id="POLICIES_DEFAULT"] span, ' +
        '[data-testid="house-rules"] span, ' +
        '[data-testid="check-in-time"] span'
      )
      const houseRules = Array.from(houseRulesEls)
        .map(el => el.textContent?.trim())
        .filter((t): t is string => !!t && t.length > 1)

      // Reviews — grab visible snippets from multiple possible containers
      const reviewEls = document.querySelectorAll(
        '[data-testid="review-card"] span, ' +
        '[data-testid="pdp-reviews-modal-scrollable-panel"] span, ' +
        '[data-testid="review-section"] span, ' +
        '[data-section-id="REVIEWS_DEFAULT"] span'
      )
      const reviews = Array.from(reviewEls)
        .map(el => el.textContent?.trim())
        .filter((t): t is string => !!t && t.length > 10 && t.length < 300)
        .slice(0, 12)

      return { title, location, description, photoCount, rating, reviewCount, amenities, highlights, houseRules, reviews }
    })

    // Close the amenity modal if it was opened
    try {
      const closeBtn = page.locator('[data-testid="modal-container"] button[aria-label="Close"], button[aria-label="Close"]').first()
      if (await closeBtn.isVisible({ timeout: 1000 })) {
        await closeBtn.click()
      }
    } catch { /* no modal to close */ }

    await browser.close()

    // Merge highlights and house rules into amenities for the AI to see
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
    console.error('[scraper] Failed:', msg)
    return {
      ...base,
      scrapeSuccess: false,
      scrapeError: msg,
    }
  }
}

