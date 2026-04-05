import { describe, it, expect } from 'vitest'
import { getCachedReport, setCachedReport } from '@/app/lib/report-cache'

describe('reportCache', () => {
  it('returns null for uncached URLs', () => {
    expect(getCachedReport('https://airbnb.com/rooms/99999', 'quick-score')).toBeNull()
  })

  it('caches and retrieves a report', () => {
    const data = { overallScore: 75, summary: 'Test report' }
    setCachedReport('https://airbnb.com/rooms/11111', 'quick-score', data)
    const cached = getCachedReport('https://airbnb.com/rooms/11111', 'quick-score')
    expect(cached).toEqual(data)
  })

  it('normalizes URLs — same room ID with different params hits cache', () => {
    const data = { overallScore: 80 }
    setCachedReport('https://www.airbnb.com/rooms/22222?check_in=2024-01-01', 'full-audit', data)
    const cached = getCachedReport('https://airbnb.com/rooms/22222?guests=4', 'full-audit')
    expect(cached).toEqual(data)
  })

  it('separates cache by plan', () => {
    setCachedReport('https://airbnb.com/rooms/33333', 'quick-score', { score: 60 })
    setCachedReport('https://airbnb.com/rooms/33333', 'full-audit', { score: 70 })
    expect(getCachedReport('https://airbnb.com/rooms/33333', 'quick-score')).toEqual({ score: 60 })
    expect(getCachedReport('https://airbnb.com/rooms/33333', 'full-audit')).toEqual({ score: 70 })
  })

  it('does not return cache for different room IDs', () => {
    setCachedReport('https://airbnb.com/rooms/44444', 'quick-score', { data: true })
    expect(getCachedReport('https://airbnb.com/rooms/55555', 'quick-score')).toBeNull()
  })
})
