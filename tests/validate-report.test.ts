import { describe, it, expect } from 'vitest'
import { validateReport } from '@/app/lib/validate-report'
import { ListingInput } from '@/app/lib/types'

function baseReport(): Record<string, unknown> {
  return {
    overallScore: 99, // should be overridden by sub-score avg
    titleScore: 70,
    descriptionScore: 60,
    amenityScore: 80,
    personaScore: 65,
    reviewScore: 75,
    titleSuggestions: ['Hot Tub House · Near NEC · Parking'],
    amenityGaps: ['Add a pool'],
    priorityActions: ['Rewrite your description'],
  }
}

function baseListing(): ListingInput {
  return {
    title: 'Test Listing',
    description: 'A cosy house that sleeps 5 near the NEC.',
    amenities: ['WiFi', 'Parking', 'Kitchen'],
    reviewCount: 100,
  }
}

describe('validateReport', () => {
  describe('overall score recalculation', () => {
    it('computes overallScore as average of sub-scores', () => {
      const report = baseReport()
      const result = validateReport(report, baseListing())
      // (70 + 60 + 80 + 65 + 75) / 5 = 70
      expect(result.overallScore).toBe(70)
    })

    it('ignores AI-supplied overallScore', () => {
      const report = baseReport()
      report.overallScore = 99
      const result = validateReport(report, baseListing())
      expect(result.overallScore).not.toBe(99)
    })

    it('rounds to nearest integer', () => {
      const report = baseReport()
      report.titleScore = 71
      // (71 + 60 + 80 + 65 + 75) / 5 = 70.2 → 70
      const result = validateReport(report, baseListing())
      expect(result.overallScore).toBe(70)
    })
  })

  describe('title suggestion validation', () => {
    it('filters out titles longer than 50 chars', () => {
      const report = baseReport()
      report.titleSuggestions = [
        'Short Title',
        'A'.repeat(51), // too long
        'Another Good Title',
      ]
      const result = validateReport(report, baseListing())
      expect(result.titleSuggestions).toHaveLength(2)
      expect(result.titleSuggestions).not.toContain('A'.repeat(51))
    })

    it('keeps titles exactly 50 chars', () => {
      const report = baseReport()
      const exact50 = 'A'.repeat(50)
      report.titleSuggestions = [exact50]
      const result = validateReport(report, baseListing())
      expect(result.titleSuggestions).toContain(exact50)
    })

    it('fixes wrong guest capacity in title suggestions', () => {
      const report = baseReport()
      report.titleSuggestions = ['Hot Tub House · Sleeps 8']
      const listing = baseListing()
      listing.description = 'A house that sleeps 5.'
      const result = validateReport(report, listing)
      expect((result.titleSuggestions as string[])[0]).toContain('Sleeps 5')
    })

    it('leaves correct capacity unchanged', () => {
      const report = baseReport()
      report.titleSuggestions = ['Hot Tub House · Sleeps 5']
      const listing = baseListing()
      listing.description = 'A house that sleeps 5.'
      const result = validateReport(report, listing)
      expect((result.titleSuggestions as string[])[0]).toContain('Sleeps 5')
    })

    it('skips capacity fix when no capacity in description', () => {
      const report = baseReport()
      report.titleSuggestions = ['Hot Tub House · Sleeps 8']
      const listing = baseListing()
      listing.description = 'A lovely house.'
      const result = validateReport(report, listing)
      expect((result.titleSuggestions as string[])[0]).toContain('Sleeps 8')
    })
  })

  describe('amenity gap dedup', () => {
    it('removes gap when amenity already in listing', () => {
      const report = baseReport()
      report.amenityGaps = ['Add WiFi for guests', 'Add a pool']
      const listing = baseListing()
      listing.amenities = ['Wi-Fi', 'Kitchen']
      const result = validateReport(report, listing)
      // WiFi should be removed (matches 'wi-fi'), pool should stay
      expect(result.amenityGaps).toEqual(['Add a pool'])
    })

    it('removes parking gap when driveway is mentioned', () => {
      const report = baseReport()
      report.amenityGaps = ['Add parking for guests']
      const listing = baseListing()
      listing.description = 'Driveway fits 3 cars.'
      const result = validateReport(report, listing)
      expect(result.amenityGaps).toEqual([])
    })

    it('removes self check-in gap when lockbox in amenities', () => {
      const report = baseReport()
      report.amenityGaps = ['Add self check-in with smart lock']
      const listing = baseListing()
      listing.amenities = ['Lockbox']
      const result = validateReport(report, listing)
      expect(result.amenityGaps).toEqual([])
    })

    it('keeps gaps for genuinely missing amenities', () => {
      const report = baseReport()
      report.amenityGaps = ['Add a pool', 'Add EV charger']
      const listing = baseListing()
      listing.amenities = ['WiFi']
      const result = validateReport(report, listing)
      expect(result.amenityGaps).toHaveLength(2)
    })
  })

  describe('priority action dedup', () => {
    it('removes self check-in action when listing has smart lock', () => {
      const report = baseReport()
      report.priorityActions = ['Add self check-in with a key safe', 'Rewrite description']
      const listing = baseListing()
      listing.amenities = ['Smart lock']
      const result = validateReport(report, listing)
      expect(result.priorityActions).toEqual(['Rewrite description'])
    })

    it('keeps self check-in action when listing lacks it', () => {
      const report = baseReport()
      report.priorityActions = ['Add self check-in', 'Rewrite description']
      const listing = baseListing()
      listing.amenities = ['WiFi']
      const result = validateReport(report, listing)
      expect(result.priorityActions).toHaveLength(2)
    })
  })

  describe('review score caps', () => {
    it('caps at 70 for <15 reviews', () => {
      const report = baseReport()
      report.reviewScore = 95
      const listing = baseListing()
      listing.reviewCount = 10
      const result = validateReport(report, listing)
      expect(result.reviewScore).toBe(70)
    })

    it('caps at 80 for 15-29 reviews', () => {
      const report = baseReport()
      report.reviewScore = 90
      const listing = baseListing()
      listing.reviewCount = 20
      const result = validateReport(report, listing)
      expect(result.reviewScore).toBe(80)
    })

    it('caps at 85 for 30-49 reviews', () => {
      const report = baseReport()
      report.reviewScore = 95
      const listing = baseListing()
      listing.reviewCount = 40
      const result = validateReport(report, listing)
      expect(result.reviewScore).toBe(85)
    })

    it('no cap for 50+ reviews', () => {
      const report = baseReport()
      report.reviewScore = 95
      const listing = baseListing()
      listing.reviewCount = 100
      const result = validateReport(report, listing)
      expect(result.reviewScore).toBe(95)
    })

    it('does not increase score below cap', () => {
      const report = baseReport()
      report.reviewScore = 50
      const listing = baseListing()
      listing.reviewCount = 5
      const result = validateReport(report, listing)
      expect(result.reviewScore).toBe(50) // already below 70
    })
  })
})
