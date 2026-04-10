import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// Use vi.hoisted so the mock factories below can reference these shared spies.
// vi.mock is hoisted to the top of the file before any imports, so regular
// const declarations wouldn't exist yet when the factory runs.
const mocks = vi.hoisted(() => ({
  captureFn: vi.fn(),
  cancelFn: vi.fn(),
  messagesCreate: vi.fn(),
  verifyPayment: vi.fn(),
  scrapeAirbnbListing: vi.fn(),
  isValidAirbnbUrl: vi.fn(),
  useAnalysisCredit: vi.fn(),
  checkOrigin: vi.fn(),
  rateLimit: vi.fn(),
  getCachedReportBySession: vi.fn(),
  getCachedReport: vi.fn(),
  setCachedReport: vi.fn(),
  saveReport: vi.fn(),
  cacheReport: vi.fn(),
}))

vi.mock('@anthropic-ai/sdk', () => ({
  // Must be constructible (`new Anthropic(...)` is called at module scope).
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

vi.mock('@/app/lib/verify-payment', () => ({
  verifyPayment: mocks.verifyPayment,
}))

vi.mock('@/app/lib/scraper', () => ({
  scrapeAirbnbListing: mocks.scrapeAirbnbListing,
  isValidAirbnbUrl: mocks.isValidAirbnbUrl,
}))

vi.mock('@/app/lib/session-usage', () => ({
  useAnalysisCredit: mocks.useAnalysisCredit,
  usePhotoCredit: vi.fn(),
  registerPaidSession: vi.fn(),
}))

vi.mock('@/app/lib/check-origin', () => ({
  checkOrigin: mocks.checkOrigin,
}))

vi.mock('@/app/lib/rate-limit', () => ({
  rateLimit: mocks.rateLimit,
}))

vi.mock('@/app/lib/supabase', () => ({
  saveReport: mocks.saveReport,
  cacheReport: mocks.cacheReport,
  getCachedReportBySession: mocks.getCachedReportBySession,
  getSupabaseAdmin: vi.fn(() => null),
}))

vi.mock('@/app/lib/report-cache', () => ({
  getCachedReport: mocks.getCachedReport,
  setCachedReport: mocks.setCachedReport,
}))

import { POST } from '@/app/api/analyze/route'

const PI_ID = 'pi_test_abc123'

function buildRequest(overrides: Record<string, unknown> = {}) {
  return new NextRequest('https://listingiq.test/api/analyze', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      url: 'https://www.airbnb.com/rooms/12345',
      sessionId: 'cs_test_session',
      plan: 'quick-score',
      ...overrides,
    }),
  })
}

// A minimal Claude response that passes validateReport without throwing.
const OK_CLAUDE_REPORT = {
  overallScore: 80,
  summary: 'ok',
  priorityActions: [],
  titleScore: 80,
  titleProblems: [],
  titleSuggestions: [],
  descriptionScore: 80,
  descriptionProblems: [],
  descriptionImprovements: [],
  amenityScore: 80,
  amenityGaps: [],
  personaScore: 80,
  reviewScore: 80,
}

describe('analyze route — manual capture settlement', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Sane defaults — individual tests override what they need.
    mocks.checkOrigin.mockReturnValue(null)
    mocks.rateLimit.mockReturnValue({ limited: false })
    mocks.verifyPayment.mockResolvedValue({
      valid: true,
      plan: 'quick-score',
      paymentIntentId: PI_ID,
      captured: false,
    })
    mocks.useAnalysisCredit.mockResolvedValue({ allowed: true })
    mocks.isValidAirbnbUrl.mockReturnValue(true)
    mocks.scrapeAirbnbListing.mockResolvedValue({
      scrapeSuccess: true,
      title: 'Cozy Loft',
      description: 'Lovely place near the park.',
      amenities: ['wifi'],
      photoUrls: [],
      photoCount: 0,
      reviewCount: 20,
    })
    mocks.getCachedReport.mockReturnValue(null)
    mocks.getCachedReportBySession.mockResolvedValue(null)
    mocks.captureFn.mockResolvedValue({ id: PI_ID, status: 'succeeded' })
    mocks.cancelFn.mockResolvedValue({ id: PI_ID, status: 'canceled' })
    mocks.cacheReport.mockResolvedValue(undefined)
    mocks.saveReport.mockResolvedValue(undefined)
  })

  it('cancels the PI when the Claude API call throws', async () => {
    // This is the key regression test: inner try/catch returns 502 without
    // explicitly cancelling, and the finally must release the authorization.
    mocks.messagesCreate.mockRejectedValue(new Error('Anthropic 503'))

    const res = await POST(buildRequest())

    expect(res.status).toBe(502)
    expect(mocks.cancelFn).toHaveBeenCalledTimes(1)
    expect(mocks.cancelFn).toHaveBeenCalledWith(PI_ID)
    expect(mocks.captureFn).not.toHaveBeenCalled()
  })

  it('cancels the PI when an unexpected error escapes to the outer catch', async () => {
    // Scraper throwing unwinds to the outer catch (500). The finally must
    // still run and release the authorization.
    mocks.scrapeAirbnbListing.mockRejectedValue(new Error('boom'))

    const res = await POST(buildRequest())

    expect(res.status).toBe(500)
    expect(mocks.cancelFn).toHaveBeenCalledTimes(1)
    expect(mocks.cancelFn).toHaveBeenCalledWith(PI_ID)
    expect(mocks.captureFn).not.toHaveBeenCalled()
  })

  it('cancels the PI when the scrape returns no listing data', async () => {
    mocks.scrapeAirbnbListing.mockResolvedValue({
      scrapeSuccess: false,
      scrapeError: '404',
    })

    const res = await POST(buildRequest())

    expect(res.status).toBe(422)
    expect(mocks.cancelFn).toHaveBeenCalledTimes(1)
    expect(mocks.cancelFn).toHaveBeenCalledWith(PI_ID)
    expect(mocks.captureFn).not.toHaveBeenCalled()
  })

  it('cancels the PI when validateReport / JSON parsing throws after the API call', async () => {
    // messagesCreate returns a non-JSON string — JSON.parse throws inside the
    // inner try, gets caught there (502), and the finally cancels.
    mocks.messagesCreate.mockResolvedValue({
      content: [{ type: 'text', text: 'not valid json at all' }],
    })

    const res = await POST(buildRequest())

    expect(res.status).toBe(502)
    expect(mocks.cancelFn).toHaveBeenCalledTimes(1)
    expect(mocks.captureFn).not.toHaveBeenCalled()
  })

  it('captures (not cancels) the PI when the analysis succeeds', async () => {
    mocks.messagesCreate.mockResolvedValue({
      content: [{ type: 'text', text: JSON.stringify(OK_CLAUDE_REPORT) }],
    })

    const res = await POST(buildRequest())

    expect(res.status).toBe(200)
    expect(mocks.captureFn).toHaveBeenCalledTimes(1)
    expect(mocks.captureFn).toHaveBeenCalledWith(PI_ID)
    expect(mocks.cancelFn).not.toHaveBeenCalled()
  })

  it('captures (not cancels) the PI on an in-memory cache hit', async () => {
    // Pre-existing bug fix regression guard: cache hits used to return
    // without capturing, giving customers a free report.
    mocks.getCachedReport.mockReturnValue({ overallScore: 75, summary: 'cached' })

    const res = await POST(buildRequest())

    expect(res.status).toBe(200)
    expect(mocks.captureFn).toHaveBeenCalledTimes(1)
    expect(mocks.captureFn).toHaveBeenCalledWith(PI_ID)
    expect(mocks.cancelFn).not.toHaveBeenCalled()
  })

  it('does not touch Stripe when payment verification fails (no PI issued yet)', async () => {
    mocks.verifyPayment.mockResolvedValue({ valid: false, plan: '', error: 'bad session' })

    const res = await POST(buildRequest())

    expect(res.status).toBe(403)
    expect(mocks.cancelFn).not.toHaveBeenCalled()
    expect(mocks.captureFn).not.toHaveBeenCalled()
  })
})
