import { ListingInput } from './types'

/**
 * Post-processing validation: catches AI errors before sending to client.
 * - Strips title suggestions that exceed 50 chars
 * - Fixes guest capacity mismatches in title suggestions
 * - Removes amenity-gap recommendations for amenities already present
 * - Filters out priority actions for things that already exist
 * - Caps review score based on review count
 * - Computes overallScore as average of sub-scores
 */
export function validateReport(report: Record<string, unknown>, listing: ListingInput) {
  const amenitiesLower = (listing.amenities ?? []).map(a => a.toLowerCase()).join(' ')
  const descLower = (listing.description ?? '').toLowerCase()
  const allListingText = `${amenitiesLower} ${descLower}`

  // --- Title suggestion validation ---
  if (Array.isArray(report.titleSuggestions)) {
    // Calculate actual guest capacity from description
    const capacityMatch = descLower.match(/sleeps?\s+(\d+)/i) ??
      descLower.match(/accommodates?\s+(\d+)/i) ??
      descLower.match(/up\s+to\s+(\d+)\s+guest/i)
    const actualCapacity = capacityMatch ? parseInt(capacityMatch[1]) : 0

    report.titleSuggestions = (report.titleSuggestions as string[])
      .filter(t => t.length <= 50) // Enforce char limit
      .map(t => {
        if (!actualCapacity) return t
        // Fix wrong "Sleeps X" in title suggestions
        const sleepsMatch = t.match(/sleeps?\s+(\d+)/i)
        if (sleepsMatch && parseInt(sleepsMatch[1]) !== actualCapacity) {
          return t.replace(/sleeps?\s+\d+/i, `Sleeps ${actualCapacity}`)
        }
        return t
      })
  }

  // --- Amenity gap validation: remove recommendations for things already present ---
  if (Array.isArray(report.amenityGaps)) {
    const knownAmenityKeywords: Record<string, string[]> = {
      'self check-in': ['self check-in', 'self checkin', 'lockbox', 'lock box', 'keypad', 'smart lock', 'key safe'],
      'dedicated workspace': ['dedicated workspace', 'workspace', 'desk', 'work desk', 'office'],
      'wifi': ['wifi', 'wi-fi', 'wireless'],
      'parking': ['parking', 'driveway', 'garage'],
      'hot tub': ['hot tub', 'jacuzzi', 'spa'],
      'washer': ['washer', 'washing machine', 'laundry'],
      'dryer': ['dryer', 'tumble dry'],
      'kitchen': ['kitchen', 'full kitchen', 'equipped kitchen'],
      'pool': ['pool', 'swimming pool'],
      'ev charger': ['ev charger', 'electric vehicle', 'charging station'],
    }

    report.amenityGaps = (report.amenityGaps as string[]).filter(gap => {
      const gapLower = gap.toLowerCase()
      for (const [, keywords] of Object.entries(knownAmenityKeywords)) {
        const gapMatchesGroup = keywords.some(kw => gapLower.includes(kw))
        if (gapMatchesGroup) {
          const listingHasIt = keywords.some(kw => allListingText.includes(kw))
          if (listingHasIt) {
            return false
          }
        }
      }
      return true
    })
  }

  // --- Priority action validation: filter out actions for things that already exist ---
  if (Array.isArray(report.priorityActions)) {
    report.priorityActions = (report.priorityActions as string[]).filter(action => {
      const actionLower = action.toLowerCase()
      if (actionLower.includes('self check-in') || actionLower.includes('self checkin') || actionLower.includes('key safe') || actionLower.includes('smart lock')) {
        if (allListingText.includes('self check-in') || allListingText.includes('lockbox') || allListingText.includes('lock box') || allListingText.includes('keypad') || allListingText.includes('smart lock') || allListingText.includes('key safe')) {
          return false
        }
      }
      return true
    })
  }

  // --- Review score cap based on review count ---
  const reviewCount = listing.reviewCount ?? 0
  const reviewScore = report.reviewScore as number
  if (reviewCount < 15 && reviewScore > 70) {
    report.reviewScore = 70
  } else if (reviewCount < 30 && reviewScore > 80) {
    report.reviewScore = 80
  } else if (reviewCount < 50 && reviewScore > 85) {
    report.reviewScore = 85
  }

  // --- Overall score: always computed from sub-scores (never trust AI's overall) ---
  const subScores = [
    report.titleScore as number,
    report.descriptionScore as number,
    report.amenityScore as number,
    report.personaScore as number,
    report.reviewScore as number,
  ].filter(s => typeof s === 'number')
  if (subScores.length > 0) {
    report.overallScore = Math.round(subScores.reduce((a, b) => a + b, 0) / subScores.length)
  }

  return report
}
