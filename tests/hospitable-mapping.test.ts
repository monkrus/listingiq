/**
 * Hospitable adapter mapping tests — validates the mapping pipeline
 * against the documented Hospitable Public API v2 schema.
 *
 * No HTTP calls, no Claude API calls — pure mapping logic.
 * Field names in the fixtures are from the OpenAPI spec and are
 * unconfirmed until validated against a real API response.
 */
import { describe, it, expect } from 'vitest'
import {
  mapPropertyToInput,
  auditReadiness,
  extractReviews,
} from '@/app/lib/integrations/hospitable-adapter'
import propertiesFixture from '@/app/lib/integrations/__fixtures__/hospitable-properties.json'
import reviewsFixture from '@/app/lib/integrations/__fixtures__/hospitable-reviews.json'

const properties = propertiesFixture.data
const reviews = reviewsFixture as unknown as Record<string, { data: any[] }>

// Helper: extract reviews for a property UUID from the fixture
function reviewsFor(uuid: string) {
  const data = reviews[uuid]?.data ?? []
  return extractReviews(data)
}

// ---- Rich property (Beach House) ----

describe('Hospitable mapping: rich property', () => {
  const prop = properties[0]
  const rev = reviewsFor(prop.id)
  const input = mapPropertyToInput(prop, rev)
  const readiness = auditReadiness(input)

  it('maps title from public_name', () => {
    expect(input.title).toBe('Stunning Oceanfront Beach House — Private Pool & Rooftop Deck')
  })

  it('maps location from address.display', () => {
    expect(input.location).toBe('42 Ocean Drive, Miami Beach, FL 33139, US')
  })

  it('maps description', () => {
    expect(input.description).toContain('Wake up to the sound of waves')
    expect(input.description!.length).toBeGreaterThan(100)
  })

  it('maps amenities as string[]', () => {
    expect(input.amenities).toContain('wifi')
    expect(input.amenities).toContain('pool')
    expect(input.amenities).toContain('hot_tub')
    expect(input.amenities!.length).toBe(16)
  })

  it('maps photo from picture field', () => {
    expect(input.photoUrls).toEqual(['https://cdn2.example.com/photos/beach-house-main.jpg'])
    expect(input.photoCount).toBe(1)
  })

  it('constructs Airbnb URL from listings[].platform_id', () => {
    expect(input.url).toBe('https://www.airbnb.com/rooms/12345678')
  })

  it('computes average rating from reviews', () => {
    // Ratings: 5, 4, 5 → avg 4.67
    expect(input.rating).toBeCloseTo(4.67, 1)
  })

  it('maps review count and texts', () => {
    expect(input.reviewCount).toBe(3)
    expect(input.reviews).toHaveLength(3)
    expect(input.reviews![0]).toContain('Absolutely incredible stay')
    expect(input.reviews![1]).toContain('Great location')
    expect(input.reviews![2]).toContain('Paradise found')
  })

  it('readiness is full', () => {
    expect(readiness.mode).toBe('full')
    expect(readiness.missing).toEqual([])
  })
})

// ---- Sparse property (Downtown Studio) ----

describe('Hospitable mapping: sparse property', () => {
  const prop = properties[1]
  const rev = reviewsFor(prop.id)
  const input = mapPropertyToInput(prop, rev)
  const readiness = auditReadiness(input)

  it('maps title from public_name', () => {
    expect(input.title).toBe('Cozy Studio')
  })

  it('maps short description', () => {
    expect(input.description).toBe('Small studio downtown.')
  })

  it('maps sparse amenities', () => {
    expect(input.amenities).toEqual(['wifi', 'tv'])
  })

  it('has only 1 photo', () => {
    expect(input.photoCount).toBe(1)
  })

  it('maps single review', () => {
    expect(input.reviewCount).toBe(1)
    expect(input.rating).toBe(3)
    expect(input.reviews![0]).toContain('Decent place')
  })

  it('constructs Airbnb URL', () => {
    expect(input.url).toBe('https://www.airbnb.com/rooms/87654321')
  })

  it('readiness is full (has title + description + photo + amenities)', () => {
    // Even though sparse, it has all required fields
    expect(readiness.mode).toBe('full')
  })
})

// ---- Edge case: empty property ----

describe('Hospitable mapping: empty property (edge case)', () => {
  const prop = properties[2]
  const rev = reviewsFor(prop.id)
  const input = mapPropertyToInput(prop, rev)
  const readiness = auditReadiness(input)

  it('does not crash on empty fields', () => {
    expect(input).toBeDefined()
  })

  it('title is empty string', () => {
    expect(input.title).toBe('')
  })

  it('description is empty string', () => {
    expect(input.description).toBe('')
  })

  it('amenities is empty array', () => {
    expect(input.amenities).toEqual([])
  })

  it('no photos', () => {
    expect(input.photoUrls).toEqual([])
    expect(input.photoCount).toBe(0)
  })

  it('no reviews', () => {
    expect(input.reviewCount).toBeUndefined()
    expect(input.reviews).toEqual([])
    expect(input.rating).toBeUndefined()
  })

  it('no Airbnb URL (empty listings)', () => {
    expect(input.url).toBeUndefined()
  })

  it('location falls back gracefully', () => {
    // address.display is "", city/state/country all "" → undefined
    expect(input.location).toBe('')
  })

  it('readiness is insufficient', () => {
    expect(readiness.mode).toBe('insufficient')
    expect(readiness.missing).toContain('title')
    expect(readiness.missing).toContain('description')
    expect(readiness.missing).toContain('photos')
    expect(readiness.missing).toContain('amenities')
  })
})

// ---- v1 path: no reviews (default) ----

describe('Hospitable mapping: v1 no-reviews path', () => {
  const noReviews = { comments: [], ratings: [] }

  it('rich property works without reviews', () => {
    const input = mapPropertyToInput(properties[0], noReviews)
    const readiness = auditReadiness(input)

    expect(input.title).toBe('Stunning Oceanfront Beach House — Private Pool & Rooftop Deck')
    expect(input.description).toContain('Wake up to the sound of waves')
    expect(input.amenities!.length).toBe(16)
    expect(input.rating).toBeUndefined()
    expect(input.reviewCount).toBeUndefined()
    expect(input.reviews).toEqual([])
    expect(readiness.mode).toBe('full')
  })

  it('sparse property works without reviews', () => {
    const input = mapPropertyToInput(properties[1], noReviews)
    const readiness = auditReadiness(input)

    expect(input.title).toBe('Cozy Studio')
    expect(input.rating).toBeUndefined()
    expect(input.reviewCount).toBeUndefined()
    expect(readiness.mode).toBe('full')
  })

  it('empty property works without reviews', () => {
    const input = mapPropertyToInput(properties[2], noReviews)
    const readiness = auditReadiness(input)

    expect(input.rating).toBeUndefined()
    expect(readiness.mode).toBe('insufficient')
  })
})

// ---- Review extraction (retained for v2) ----

describe('Hospitable review extraction (v2)', () => {
  it('extracts ratings and comments from public field', () => {
    const result = extractReviews(reviews['550e8400-e29b-41d4-a716-446655440001'].data)
    expect(result.comments).toHaveLength(3)
    expect(result.ratings).toEqual([5, 4, 5])
  })

  it('handles empty review array', () => {
    const result = extractReviews([])
    expect(result.comments).toEqual([])
    expect(result.ratings).toEqual([])
  })

  it('handles null/undefined review fields gracefully', () => {
    const result = extractReviews([
      { public: { rating: null, review: null } },
      { public: null },
      {},
    ])
    expect(result.comments).toEqual([])
    expect(result.ratings).toEqual([])
  })

  it('reviews attach to correct properties', () => {
    const beachReviews = extractReviews(reviews['550e8400-e29b-41d4-a716-446655440001'].data)
    const studioReviews = extractReviews(reviews['550e8400-e29b-41d4-a716-446655440002'].data)
    const emptyReviews = extractReviews(reviews['550e8400-e29b-41d4-a716-446655440003'].data)

    expect(beachReviews.comments).toHaveLength(3)
    expect(studioReviews.comments).toHaveLength(1)
    expect(emptyReviews.comments).toHaveLength(0)
  })
})
