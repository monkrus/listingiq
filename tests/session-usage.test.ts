import { describe, it, expect, vi } from 'vitest'

// Mock stripe before importing session-usage
vi.mock('@/app/lib/stripe', () => ({
  stripe: {
    checkout: {
      sessions: {
        retrieve: vi.fn().mockResolvedValue({ metadata: {} }),
        update: vi.fn().mockResolvedValue({}),
      },
    },
  },
}))

import { registerPaidSession, useAnalysisCredit, usePhotoCredit } from '@/app/lib/session-usage'

describe('sessionUsage', () => {
  it('allows first analysis for registered session', async () => {
    registerPaidSession('sess-1', 'quick-score')
    const result = await useAnalysisCredit('sess-1', 'quick-score')
    expect(result.allowed).toBe(true)
  })

  it('blocks second analysis for quick-score (1 credit)', async () => {
    registerPaidSession('sess-2', 'quick-score')
    await useAnalysisCredit('sess-2', 'quick-score')
    const result = await useAnalysisCredit('sess-2', 'quick-score')
    expect(result.allowed).toBe(false)
    expect(result.error).toContain('already been used')
  })

  it('allows re-access with reaccess flag', async () => {
    registerPaidSession('sess-3', 'quick-score')
    await useAnalysisCredit('sess-3', 'quick-score')
    const result = await useAnalysisCredit('sess-3', 'quick-score', { reaccess: true })
    expect(result.allowed).toBe(true)
  })

  it('blocks photo credit for quick-score plan', async () => {
    registerPaidSession('sess-4', 'quick-score')
    const result = await usePhotoCredit('sess-4', 'quick-score')
    expect(result.allowed).toBe(false)
    expect(result.error).toContain('not included')
  })

  it('allows photo credit for full-audit plan', async () => {
    registerPaidSession('sess-5', 'full-audit')
    const result = await usePhotoCredit('sess-5', 'full-audit')
    expect(result.allowed).toBe(true)
  })

  it('blocks second photo credit for full-audit (1 credit)', async () => {
    registerPaidSession('sess-6', 'full-audit')
    await usePhotoCredit('sess-6', 'full-audit')
    const result = await usePhotoCredit('sess-6', 'full-audit')
    expect(result.allowed).toBe(false)
  })
})
