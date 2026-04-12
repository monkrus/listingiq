/**
 * Tests for the scraper module: helper functions, fallback chain,
 * and data extraction from mocked API/HTML responses.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock global fetch
const fetchMock = vi.fn()
vi.stubGlobal('fetch', fetchMock)

// Mock Apify client (tier 1 is dormant by default)
vi.mock('apify-client', () => ({
  ApifyClient: class {
    actor() { return { call: vi.fn() } }
    dataset() { return { listItems: vi.fn().mockResolvedValue({ items: [] }) } }
  },
}))

import { scrapeAirbnbListing, isValidAirbnbUrl } from '@/app/lib/scraper'

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('APIFY_ENABLED', 'false')
})

// ── URL validation ──

describe('isValidAirbnbUrl', () => {
  it('accepts standard Airbnb room URL', () => {
    expect(isValidAirbnbUrl('https://www.airbnb.com/rooms/12345')).toBe(true)
  })

  it('accepts regional Airbnb domains', () => {
    expect(isValidAirbnbUrl('https://www.airbnb.co.uk/rooms/12345')).toBe(true)
    expect(isValidAirbnbUrl('https://www.airbnb.de/rooms/99999')).toBe(true)
  })

  it('accepts URL with query params', () => {
    expect(isValidAirbnbUrl('https://www.airbnb.com/rooms/12345?adults=2&check_in=2024-01-01')).toBe(true)
  })

  it('rejects non-Airbnb URLs', () => {
    expect(isValidAirbnbUrl('https://www.booking.com/hotel/12345')).toBe(false)
    expect(isValidAirbnbUrl('https://www.google.com')).toBe(false)
  })

  it('rejects URLs without room ID', () => {
    expect(isValidAirbnbUrl('https://www.airbnb.com/experiences/12345')).toBe(false)
  })

  it('rejects empty/null input', () => {
    expect(isValidAirbnbUrl('')).toBe(false)
  })
})

// ── Scraper fallback chain ──

describe('scrapeAirbnbListing', () => {
  it('returns data from API tier on success', async () => {
    const mockApiResponse = {
      data: {
        presentation: {
          stayProductDetailPage: {
            sections: {
              metadata: { listingTitle: 'Cozy Flat in London' },
            },
          },
        },
      },
    }
    // The API response is JSON-stringified and regex-matched
    const jsonStr = JSON.stringify(mockApiResponse)

    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(JSON.parse(jsonStr)),
      text: () => Promise.resolve(jsonStr),
    })

    const result = await scrapeAirbnbListing('https://www.airbnb.com/rooms/12345')
    expect(result.scrapeSuccess).toBe(true)
    expect(result.title).toBe('Cozy Flat in London')
  })

  it('falls back to HTML tier when API returns 403', async () => {
    // Tier 2 (API) fails
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 403,
    })

    // Tier 3 (HTML) succeeds
    const htmlContent = `
      <html>
      <head>
        <title>Beach House - Airbnb</title>
        <meta property="og:description" content="A beautiful beach house with ocean views and modern amenities." />
      </head>
      <body></body>
      </html>
    `
    fetchMock.mockResolvedValueOnce({
      ok: true,
      text: () => Promise.resolve(htmlContent),
    })

    const result = await scrapeAirbnbListing('https://www.airbnb.com/rooms/99999')
    expect(result.scrapeSuccess).toBe(true)
    expect(result.title).toBe('Beach House')
    expect(result.description).toContain('beach house')
  })

  it('returns failure when all tiers fail', async () => {
    // API returns 500
    fetchMock.mockResolvedValueOnce({ ok: false, status: 500 })
    // HTML returns 500
    fetchMock.mockResolvedValueOnce({ ok: false, status: 500 })

    const result = await scrapeAirbnbListing('https://www.airbnb.com/rooms/11111')
    expect(result.scrapeSuccess).toBe(false)
    expect(result.scrapeError).toBeTruthy()
  })

  it('handles network error gracefully', async () => {
    // API tier throws (try/catch in apiScrape catches it)
    fetchMock.mockRejectedValueOnce(new Error('Network timeout'))
    // HTML tier: return empty page so fetchScrape doesn't also throw
    fetchMock.mockResolvedValueOnce({ ok: true, text: () => Promise.resolve('<html></html>') })

    const result = await scrapeAirbnbListing('https://www.airbnb.com/rooms/22222')
    expect(result.scrapeSuccess).toBe(false)
  })

  it('returns failure when page has no extractable data', async () => {
    // API tier fails
    fetchMock.mockResolvedValueOnce({ ok: false, status: 404 })
    // HTML tier returns page with no title or description
    fetchMock.mockResolvedValueOnce({ ok: true, text: () => Promise.resolve('<html><head></head><body></body></html>') })

    const result = await scrapeAirbnbListing('https://www.airbnb.com/rooms/00000')
    expect(result.scrapeSuccess).toBe(false)
  })

  it('extracts photo URLs from API response', async () => {
    const apiData = {
      photos: [
        { baseUrl: 'https://a0.muscache.com/im/pictures/photo1.jpg' },
        { baseUrl: 'https://a0.muscache.com/im/pictures/photo2.jpg' },
      ],
      listingTitle: 'Test Listing',
      description: 'A great place to stay with amazing views and comfortable beds.',
    }
    const jsonStr = JSON.stringify(apiData)

    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(JSON.parse(jsonStr)),
      text: () => Promise.resolve(jsonStr),
    })

    const result = await scrapeAirbnbListing('https://www.airbnb.com/rooms/33333')
    expect(result.scrapeSuccess).toBe(true)
    expect(result.photoUrls?.length).toBeGreaterThan(0)
    expect(result.photoUrls?.[0]).toContain('muscache.com')
  })

  it('extracts rating and review count from API', async () => {
    const apiData = {
      listingTitle: 'Rated Listing',
      description: 'Has reviews and rating, perfect for testing the extraction logic.',
      ratingValue: 4.85,
      reviewCount: 127,
    }
    const jsonStr = JSON.stringify(apiData)

    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(JSON.parse(jsonStr)),
    })

    const result = await scrapeAirbnbListing('https://www.airbnb.com/rooms/44444')
    expect(result.scrapeSuccess).toBe(true)
    expect(result.rating).toBe(4.85)
    expect(result.reviewCount).toBe(127)
  })
})
