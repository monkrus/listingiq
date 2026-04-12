import { describe, it, expect } from 'vitest'
import { estimateImprovement } from '@/app/lib/estimate-improvement'

describe('estimateImprovement', () => {
  it('returns Low for score >= 90', () => {
    expect(estimateImprovement(90)).toMatch(/Low/)
    expect(estimateImprovement(100)).toMatch(/Low/)
  })

  it('returns Moderate for 80-89', () => {
    expect(estimateImprovement(80)).toMatch(/Moderate/)
    expect(estimateImprovement(89)).toMatch(/Moderate/)
  })

  it('returns Good for 70-79', () => {
    expect(estimateImprovement(70)).toMatch(/Good/)
    expect(estimateImprovement(79)).toMatch(/Good/)
  })

  it('returns High for 60-69', () => {
    expect(estimateImprovement(60)).toMatch(/High/)
    expect(estimateImprovement(69)).toMatch(/High/)
  })

  it('returns Very high for 50-59', () => {
    expect(estimateImprovement(50)).toMatch(/Very high/)
    expect(estimateImprovement(59)).toMatch(/Very high/)
  })

  it('returns Substantial for <50', () => {
    expect(estimateImprovement(49)).toMatch(/Substantial/)
    expect(estimateImprovement(0)).toMatch(/Substantial/)
  })

  it('each bracket returns a different message', () => {
    const messages = [95, 85, 75, 65, 55, 30].map(estimateImprovement)
    const unique = new Set(messages)
    expect(unique.size).toBe(6)
  })
})
