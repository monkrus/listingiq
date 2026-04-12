/**
 * Tests the re-access billing prevention fix.
 *
 * When a customer re-accesses their report (email link), the server must
 * return cached data ONLY — never fall through to a fresh Claude API call.
 * This test verifies both /api/analyze and /api/analyze-photos honour
 * the cacheOnly flag and return 410 on cache miss instead of re-billing.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// ── Shared mocks ──
const mocks = vi.hoisted(() => ({
  // Anthropic
  messagesCreate: vi.fn(),
  // Stripe
  captureFn: vi.fn(),
  cancelFn: vi.fn(),
  // Auth
  verifyPayment: vi.fn(),
  useAnalysisCredit: vi.fn(),
  usePhotoCredit: vi.fn(),
  // Infra
  checkOrigin: vi.fn(),
  rateLimit: vi.fn(),
  // DB
  getCachedReportBySession: vi.fn(),
  getCachedReport: vi.fn(),
  setCachedReport: vi.fn(),
  saveReport: vi.fn(),
  cacheReport: vi.fn(),
  updateCachedPhotos: vi.fn(),
  // Scraper
  scrapeAirbnbListing: vi.fn(),
  isValidAirbnbUrl: vi.fn(),
  // Photos
  getPhotos: vi.fn(),
  deletePhotos: vi.fn(),
}))

vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = { create: mocks.messagesCreate }
  },
}))

vi.mock('@/app/lib/stripe', () => ({
  stripe: {
    paymentIntents: { capture: mocks.captureFn, cancel: mocks.cancelFn },
    checkout: { sessions: { retrieve: vi.fn(), update: vi.fn() } },
  },
}))

vi.mock('@/app/lib/verify-payment', () => ({ verifyPayment: mocks.verifyPayment }))

vi.mock('@/app/lib/session-usage', () => ({
  useAnalysisCredit: mocks.useAnalysisCredit,
  usePhotoCredit: mocks.usePhotoCredit,
  registerPaidSession: vi.fn(),
}))

vi.mock('@/app/lib/check-origin', () => ({ checkOrigin: mocks.checkOrigin }))
vi.mock('@/app/lib/rate-limit', () => ({
  rateLimit: mocks.rateLimit,
  dailyRateLimit: vi.fn().mockResolvedValue({ limited: false }),
}))

vi.mock('@/app/lib/supabase', () => ({
  saveReport: mocks.saveReport,
  cacheReport: mocks.cacheReport,
  getCachedReportBySession: mocks.getCachedReportBySession,
  updateCachedPhotos: mocks.updateCachedPhotos,
  getSupabaseAdmin: vi.fn(() => null),
}))

vi.mock('@/app/lib/report-cache', () => ({
  getCachedReport: mocks.getCachedReport,
  setCachedReport: mocks.setCachedReport,
}))

vi.mock('@/app/lib/scraper', () => ({
  scrapeAirbnbListing: mocks.scrapeAirbnbListing,
  isValidAirbnbUrl: mocks.isValidAirbnbUrl,
}))

vi.mock('@/app/lib/photo-store', () => ({
  getPhotos: mocks.getPhotos,
  deletePhotos: mocks.deletePhotos,
}))

vi.mock('@/app/lib/validate-image', () => ({
  validateImageFile: vi.fn(),
  validateBase64Image: vi.fn(),
  detectImageType: vi.fn(),
}))

vi.mock('@/app/lib/validation', () => ({
  isValidPhotoUrl: vi.fn(() => true),
}))

import { POST as analyzePost } from '@/app/api/analyze/route'
import { POST as photoPost } from '@/app/api/analyze-photos/route'

beforeEach(() => {
  vi.clearAllMocks()
  // Default: pass all guards
  mocks.checkOrigin.mockReturnValue(null)
  mocks.rateLimit.mockReturnValue({ limited: false, remaining: 5 })
})

// ── /api/analyze ──

describe('/api/analyze re-access billing prevention', () => {
  function buildReq(overrides: Record<string, unknown> = {}) {
    return new NextRequest('https://listingiq.test/api/analyze', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        url: 'https://www.airbnb.com/rooms/12345',
        sessionId: 'cs_reaccess',
        plan: 'quick-score',
        reaccess: true,
        ...overrides,
      }),
    })
  }

  it('returns cached report on re-access when cache exists', async () => {
    mocks.verifyPayment.mockResolvedValue({ valid: true, plan: 'quick-score', paymentIntentId: 'pi_1', captured: true })
    mocks.useAnalysisCredit.mockResolvedValue({ allowed: true, cacheOnly: true })
    mocks.getCachedReportBySession.mockResolvedValue({
      reportData: { overallScore: 72, summary: 'cached' },
      photoResults: null,
      photoPreviews: null,
    })

    const res = await analyzePost(buildReq())
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.summary).toBe('cached')
    // Claude should NOT have been called
    expect(mocks.messagesCreate).not.toHaveBeenCalled()
  })

  it('returns 410 on re-access when cache is empty (no re-billing)', async () => {
    mocks.verifyPayment.mockResolvedValue({ valid: true, plan: 'quick-score', paymentIntentId: 'pi_2', captured: false })
    mocks.useAnalysisCredit.mockResolvedValue({ allowed: true, cacheOnly: true })
    mocks.getCachedReportBySession.mockResolvedValue(null) // cache miss

    const res = await analyzePost(buildReq())
    const data = await res.json()

    expect(res.status).toBe(410)
    expect(data.error).toMatch(/no longer available/)
    // Claude should NOT have been called
    expect(mocks.messagesCreate).not.toHaveBeenCalled()
    // Payment should still be captured (customer paid, support handles manually)
    expect(mocks.captureFn).toHaveBeenCalledWith('pi_2')
  })

  it('does NOT 410 on fresh checkout (not re-access)', async () => {
    mocks.verifyPayment.mockResolvedValue({ valid: true, plan: 'quick-score', paymentIntentId: 'pi_3', captured: false })
    mocks.useAnalysisCredit.mockResolvedValue({ allowed: true }) // no cacheOnly
    mocks.isValidAirbnbUrl.mockReturnValue(true)
    mocks.scrapeAirbnbListing.mockResolvedValue({ scrapeSuccess: true, title: 'Test', description: 'A place' })
    mocks.messagesCreate.mockResolvedValue({
      content: [{ type: 'text', text: JSON.stringify({
        overallScore: 72, summary: 'ok', priorityActions: [],
        titleScore: 70, titleProblems: [], titleSuggestions: [],
        descriptionScore: 70, descriptionProblems: [], descriptionRewrite: '',
        amenityScore: 70, amenityGaps: [], topAmenities: [],
        personaScore: 70, personaProblems: [], personaSuggestion: '',
        reviewScore: 70, guestLoves: [], reviewRisks: [],
        photoScore: 50, photoCount: 0, missingPhotos: [],
        seoKeywords: [], conversionTips: [], competitorInsight: '',
      })}],
    })
    mocks.cacheReport.mockResolvedValue(true)

    const res = await analyzePost(buildReq({ reaccess: false }))
    expect(res.status).toBe(200)
    // Claude SHOULD have been called for fresh checkout
    expect(mocks.messagesCreate).toHaveBeenCalledTimes(1)
  })
})

// ── /api/analyze-photos ──

describe('/api/analyze-photos re-access billing prevention', () => {
  function buildPhotoReq(overrides: Record<string, unknown> = {}) {
    return new NextRequest('https://listingiq.test/api/analyze-photos', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        photoUrls: ['https://a0.muscache.com/im/pictures/photo1.jpg'],
        sessionId: 'cs_photo_reaccess',
        reaccess: true,
        ...overrides,
      }),
    })
  }

  it('returns cached photos on re-access when cache exists', async () => {
    mocks.verifyPayment.mockResolvedValue({ valid: true, plan: 'full-audit' })
    mocks.usePhotoCredit.mockResolvedValue({ allowed: true, cacheOnly: true })
    mocks.getCachedReportBySession.mockResolvedValue({
      photoResults: { photos: [{ index: 0, verdict: 'keep', score: 85 }], overallPhotoScore: 85 },
    })

    const res = await photoPost(buildPhotoReq())
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.overallPhotoScore).toBe(85)
    expect(mocks.messagesCreate).not.toHaveBeenCalled()
  })

  it('returns 410 on re-access when photo cache is empty (no re-billing)', async () => {
    mocks.verifyPayment.mockResolvedValue({ valid: true, plan: 'full-audit' })
    mocks.usePhotoCredit.mockResolvedValue({ allowed: true, cacheOnly: true })
    mocks.getCachedReportBySession.mockResolvedValue(null) // cache miss

    const res = await photoPost(buildPhotoReq())
    const data = await res.json()

    expect(res.status).toBe(410)
    expect(data.error).toMatch(/no longer available/)
    expect(mocks.messagesCreate).not.toHaveBeenCalled()
  })

  it('returns 410 when cache exists but photoResults is null', async () => {
    mocks.verifyPayment.mockResolvedValue({ valid: true, plan: 'full-audit' })
    mocks.usePhotoCredit.mockResolvedValue({ allowed: true, cacheOnly: true })
    mocks.getCachedReportBySession.mockResolvedValue({
      reportData: { overallScore: 72 },
      photoResults: null, // text cached but photos are not
    })

    const res = await photoPost(buildPhotoReq())
    const data = await res.json()

    expect(res.status).toBe(410)
    expect(data.error).toMatch(/no longer available/)
    expect(mocks.messagesCreate).not.toHaveBeenCalled()
  })
})
