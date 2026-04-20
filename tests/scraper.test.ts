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

/** Helper: create a mock fetch Response with headers */
function mockResponse(opts: { ok: boolean; status?: number; json?: unknown; text?: string }) {
  return {
    ok: opts.ok,
    status: opts.status ?? (opts.ok ? 200 : 500),
    headers: { get: () => null },
    json: () => Promise.resolve(opts.json ?? {}),
    text: () => Promise.resolve(opts.text ?? ''),
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('APIFY_ENABLED', 'false')
  vi.stubEnv('AIRBNB_API_KEY', 'test-api-key')
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
    const jsonStr = JSON.stringify(mockApiResponse)

    fetchMock.mockResolvedValueOnce(mockResponse({
      ok: true,
      json: JSON.parse(jsonStr),
      text: jsonStr,
    }))

    const result = await scrapeAirbnbListing('https://www.airbnb.com/rooms/12345')
    expect(result.scrapeSuccess).toBe(true)
    expect(result.title).toBe('Cozy Flat in London')
  })

  it('falls back to HTML tier when API returns 403', async () => {
    // API fails with 403
    fetchMock.mockResolvedValueOnce(mockResponse({ ok: false, status: 403, text: 'Forbidden' }))

    // HTML fetch succeeds
    const htmlContent = `
      <html>
      <head>
        <title>Beach House - Airbnb</title>
        <meta property="og:description" content="A beautiful beach house with ocean views and modern amenities." />
      </head>
      <body></body>
      </html>
    `
    fetchMock.mockResolvedValueOnce(mockResponse({ ok: true, text: htmlContent }))

    const result = await scrapeAirbnbListing('https://www.airbnb.com/rooms/99999')
    expect(result.scrapeSuccess).toBe(true)
    expect(result.title).toBe('Beach House')
    expect(result.description).toContain('beach house')
  })

  it('returns failure when all tiers fail', async () => {
    // API returns 500
    fetchMock.mockResolvedValueOnce(mockResponse({ ok: false, status: 500, text: 'Server Error' }))
    // HTML fetch returns 500
    fetchMock.mockResolvedValueOnce(mockResponse({ ok: false, status: 500 }))
    // Last resort retry also fails
    fetchMock.mockResolvedValueOnce(mockResponse({ ok: false, status: 500 }))

    const result = await scrapeAirbnbListing('https://www.airbnb.com/rooms/11111')
    expect(result.scrapeSuccess).toBe(false)
    expect(result.scrapeError).toBeTruthy()
  })

  it('handles network error gracefully', async () => {
    // API tier throws
    fetchMock.mockRejectedValueOnce(new Error('Network timeout'))
    // HTML tier returns empty page
    fetchMock.mockResolvedValueOnce(mockResponse({ ok: true, text: '<html></html>' }))
    // Last resort retry also returns empty
    fetchMock.mockResolvedValueOnce(mockResponse({ ok: true, text: '<html></html>' }))

    const result = await scrapeAirbnbListing('https://www.airbnb.com/rooms/22222')
    expect(result.scrapeSuccess).toBe(false)
  })

  it('returns failure when page has no extractable data', async () => {
    // API tier fails
    fetchMock.mockResolvedValueOnce(mockResponse({ ok: false, status: 404, text: 'Not found' }))
    // HTML tier returns page with no title or description
    fetchMock.mockResolvedValueOnce(mockResponse({ ok: true, text: '<html><head></head><body></body></html>' }))
    // Last resort retry also empty
    fetchMock.mockResolvedValueOnce(mockResponse({ ok: true, text: '<html><head></head><body></body></html>' }))

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

    fetchMock.mockResolvedValueOnce(mockResponse({
      ok: true,
      json: JSON.parse(jsonStr),
      text: jsonStr,
    }))

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

    fetchMock.mockResolvedValueOnce(mockResponse({
      ok: true,
      json: JSON.parse(jsonStr),
      text: jsonStr,
    }))

    const result = await scrapeAirbnbListing('https://www.airbnb.com/rooms/44444')
    expect(result.scrapeSuccess).toBe(true)
    expect(result.rating).toBe(4.85)
    expect(result.reviewCount).toBe(127)
  })
})
