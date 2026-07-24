/**
 * Tests for the $49 Full Audit photo analysis flow.
 *
 * Covers:
 * 1. PMS checkout route includes uploadId in Stripe metadata + success URL
 * 2. analyze-photos route returns proper errors (not silent swallow)
 * 3. analyze-photos route uses resized previews for stored photos
 * 4. Priority chain: uploadId → photoUrls fallback
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// ── Shared mocks ──
const mocks = vi.hoisted(() => ({
  // Stripe
  sessionsCreate: vi.fn(),
  // Anthropic
  messagesCreate: vi.fn(),
  // Auth
  verifyPayment: vi.fn(),
  usePhotoCredit: vi.fn(),
  // Infra
  checkOrigin: vi.fn(),
  rateLimit: vi.fn(),
  // DB
  getCachedReportBySession: vi.fn(),
  updateCachedPhotos: vi.fn(),
  updateCachedReportPhotos: vi.fn(),
  // Photos
  getPhotos: vi.fn(),
  deletePhotos: vi.fn(),
  // Image
  validateImageFile: vi.fn(),
  validateBase64Image: vi.fn(),
  detectImageType: vi.fn(),
  resizeForVision: vi.fn(),
  // Email
  triggerReportEmail: vi.fn(),
  // Analytics
  logAnalyticsEvent: vi.fn(),
}))

vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = { create: mocks.messagesCreate }
  },
}))

vi.mock('@/app/lib/stripe', () => ({
  stripe: {
    checkout: { sessions: { create: mocks.sessionsCreate } },
  },
  PLANS: new Proxy({}, {
    get(_, prop) {
      const plans: Record<string, { name: string; price: number; priceId: string; description: string }> = {
        'quick-score': { name: 'Quick Score', price: 2900, priceId: 'price_qs', description: 'Quick' },
        'full-audit': { name: 'Full Audit', price: 4900, priceId: 'price_fa', description: 'Full' },
        'full-audit-upgrade': { name: 'Upgrade', price: 2000, priceId: 'price_up', description: 'Upgrade' },
      }
      return plans[prop as string]
    },
  }),
}))

vi.mock('@/app/lib/verify-payment', () => ({ verifyPayment: mocks.verifyPayment }))
vi.mock('@/app/lib/session-usage', () => ({
  usePhotoCredit: mocks.usePhotoCredit,
}))
vi.mock('@/app/lib/check-origin', () => ({ checkOrigin: mocks.checkOrigin }))
vi.mock('@/app/lib/rate-limit', () => ({
  rateLimit: mocks.rateLimit,
  dailyRateLimit: vi.fn().mockResolvedValue({ limited: false }),
}))
vi.mock('@/app/lib/supabase', () => ({
  getCachedReportBySession: mocks.getCachedReportBySession,
  updateCachedPhotos: mocks.updateCachedPhotos,
  getSupabaseAdmin: vi.fn(() => null),
}))
vi.mock('@/app/lib/report-cache', () => ({
  updateCachedReportPhotos: mocks.updateCachedReportPhotos,
}))
vi.mock('@/app/lib/photo-store', () => ({
  getPhotos: mocks.getPhotos,
  deletePhotos: mocks.deletePhotos,
}))
vi.mock('@/app/lib/validate-image', () => ({
  validateImageFile: mocks.validateImageFile,
  validateBase64Image: mocks.validateBase64Image.mockReturnValue('image/jpeg'),
  detectImageType: mocks.detectImageType,
}))
vi.mock('@/app/lib/validation', () => ({
  isValidPhotoUrl: vi.fn(() => true),
}))
vi.mock('@/app/lib/resize-image', () => ({
  resizeForVision: mocks.resizeForVision,
}))
vi.mock('@/app/lib/trigger-report-email', () => ({
  triggerReportEmail: mocks.triggerReportEmail.mockResolvedValue(undefined),
}))
vi.mock('@/app/lib/analytics', () => ({
  logAnalyticsEvent: mocks.logAnalyticsEvent,
}))

import { POST as checkoutPost } from '@/app/api/integrations/checkout/route'
import { POST as photoPost } from '@/app/api/analyze-photos/route'

beforeEach(() => {
  vi.clearAllMocks()
  mocks.checkOrigin.mockReturnValue(null)
  mocks.rateLimit.mockReturnValue({ limited: false, remaining: 5 })
})

// ── PMS Checkout: uploadId in metadata ──

describe('PMS checkout includes uploadId', () => {
  function buildCheckoutReq(body: Record<string, unknown>, cookies: Record<string, string> = {}) {
    const req = new NextRequest('https://listingiq.test/api/integrations/checkout', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
    // Simulate cookies
    for (const [name, value] of Object.entries(cookies)) {
      req.cookies.set(name, value)
    }
    return req
  }

  it('stores uploadId in Stripe metadata when provided', async () => {
    mocks.sessionsCreate.mockResolvedValue({ url: 'https://checkout.stripe.com/session' })

    await checkoutPost(buildCheckoutReq(
      { plan: 'full-audit', platform: 'hospitable', propertyId: 'prop_123', uploadId: 'upload_abc' },
      { hospitable_connection_id: 'conn_456' }
    ))

    expect(mocks.sessionsCreate).toHaveBeenCalledTimes(1)
    const args = mocks.sessionsCreate.mock.calls[0][0]
    expect(args.metadata).toMatchObject({
      planKey: 'full-audit',
      photoUploadId: 'upload_abc',
    })
    expect(args.success_url).toContain('uploadId=upload_abc')
  })

  it('omits photoUploadId from metadata when uploadId not provided', async () => {
    mocks.sessionsCreate.mockResolvedValue({ url: 'https://checkout.stripe.com/session' })

    await checkoutPost(buildCheckoutReq(
      { plan: 'full-audit', platform: 'hostex', propertyId: 'prop_789' },
      { hostex_connection_id: 'conn_012' }
    ))

    const args = mocks.sessionsCreate.mock.calls[0][0]
    expect(args.metadata).not.toHaveProperty('photoUploadId')
    expect(args.success_url).not.toContain('uploadId')
  })

  it('handles full-audit-upgrade with uploadId', async () => {
    mocks.sessionsCreate.mockResolvedValue({ url: 'https://checkout.stripe.com/session' })

    await checkoutPost(buildCheckoutReq(
      { plan: 'full-audit-upgrade', platform: 'hospitable', propertyId: 'prop_up', uploadId: 'upload_upgrade' },
      { hospitable_connection_id: 'conn_up' }
    ))

    const args = mocks.sessionsCreate.mock.calls[0][0]
    // effectivePlan should be 'full-audit' even for upgrade
    expect(args.metadata.planKey).toBe('full-audit')
    expect(args.metadata.photoUploadId).toBe('upload_upgrade')
  })
})

// ── Photo analysis error responses ──

describe('analyze-photos returns proper error codes', () => {
  function buildPhotoReq(overrides: Record<string, unknown> = {}) {
    return new NextRequest('https://listingiq.test/api/analyze-photos', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        uploadId: 'upload_test',
        sessionId: 'cs_test',
        ...overrides,
      }),
    })
  }

  it('returns 403 when payment is invalid', async () => {
    mocks.getPhotos.mockReturnValue([{ base64: 'abc', mediaType: 'image/jpeg', filename: 'test.jpg' }])
    mocks.verifyPayment.mockResolvedValue({ valid: false, error: 'Payment required' })

    const res = await photoPost(buildPhotoReq())
    expect(res.status).toBe(403)
    const data = await res.json()
    expect(data.error).toMatch(/Payment required/)
  })

  it('returns 410 when stored photos have expired', async () => {
    mocks.getPhotos.mockReturnValue(null) // expired

    const res = await photoPost(buildPhotoReq())
    expect(res.status).toBe(410)
    const data = await res.json()
    expect(data.error).toMatch(/expired/)
  })

  it('returns 429 when rate limited', async () => {
    mocks.rateLimit.mockReturnValue({ limited: true })

    const res = await photoPost(buildPhotoReq())
    expect(res.status).toBe(429)
  })

  it('returns 400 when neither photoUrls nor uploadId is provided', async () => {
    const res = await photoPost(buildPhotoReq({ uploadId: undefined }))
    expect(res.status).toBe(400)
  })
})

// ── Stored photos use resized previews ──

describe('analyze-photos uses resized previews for stored photos', () => {
  function buildPhotoReq(overrides: Record<string, unknown> = {}) {
    return new NextRequest('https://listingiq.test/api/analyze-photos', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        uploadId: 'upload_preview_test',
        sessionId: 'cs_preview_test',
        ...overrides,
      }),
    })
  }

  it('returns resized base64 in previews, not original full-size', async () => {
    // Original photo: large base64 string (simulating 4MB)
    const originalBase64 = 'A'.repeat(1000)
    // Resized: much smaller
    const resizedBuffer = Buffer.from('resized-small-image')

    mocks.getPhotos.mockReturnValue([
      { base64: originalBase64, mediaType: 'image/jpeg', filename: 'big-photo.jpg' },
    ])
    mocks.validateBase64Image.mockReturnValue('image/jpeg')
    mocks.resizeForVision.mockResolvedValue({
      buffer: resizedBuffer,
      mediaType: 'image/jpeg' as const,
    })
    mocks.verifyPayment.mockResolvedValue({ valid: true, plan: 'full-audit' })
    mocks.usePhotoCredit.mockResolvedValue({ allowed: true })
    mocks.updateCachedPhotos.mockResolvedValue(undefined)

    // Mock Claude response
    mocks.messagesCreate.mockResolvedValue({
      content: [{
        type: 'text',
        text: JSON.stringify({
          photos: [{ index: 1, filename: 'big-photo.jpg', verdict: 'keep', score: 80, roomType: 'bedroom', strengths: ['good'], problems: [], retakeInstructions: null, heroWorthy: true }],
          overallPhotoScore: 80,
          missingShots: [],
          heroSuggestion: 'Photo 1 is great',
          suggestedOrder: [1],
        }),
      }],
    })

    const res = await photoPost(buildPhotoReq())
    expect(res.status).toBe(200)

    const data = await res.json()
    expect(data.previews).toBeDefined()
    expect(data.previews).toHaveLength(1)

    // Preview should use resized data, not original
    const resizedBase64 = resizedBuffer.toString('base64')
    expect(data.previews[0]).toBe(`data:image/jpeg;base64,${resizedBase64}`)
    // Must NOT contain the original large base64
    expect(data.previews[0]).not.toContain(originalBase64)
  })
})

// ── Priority chain: uploadId → photoUrls ──

describe('analyze-photos priority chain', () => {
  it('processes uploadId and cleans up stored photos after analysis', async () => {
    const resizedBuffer = Buffer.from('resized')
    mocks.getPhotos.mockReturnValue([
      { base64: 'uploaded-photo', mediaType: 'image/jpeg', filename: 'uploaded.jpg' },
    ])
    mocks.validateBase64Image.mockReturnValue('image/jpeg')
    mocks.resizeForVision.mockResolvedValue({ buffer: resizedBuffer, mediaType: 'image/jpeg' as const })
    mocks.verifyPayment.mockResolvedValue({ valid: true, plan: 'full-audit' })
    mocks.usePhotoCredit.mockResolvedValue({ allowed: true })
    mocks.updateCachedPhotos.mockResolvedValue(undefined)

    mocks.messagesCreate.mockResolvedValue({
      content: [{
        type: 'text',
        text: JSON.stringify({
          photos: [{ index: 1, filename: 'uploaded.jpg', verdict: 'keep', score: 75, roomType: 'bedroom', strengths: ['ok'], problems: [], retakeInstructions: null, heroWorthy: false }],
          overallPhotoScore: 75,
          missingShots: [],
          heroSuggestion: 'Photo 1',
          suggestedOrder: [1],
        }),
      }],
    })

    // Hook sends uploadId-only request (Priority 1)
    const req = new NextRequest('https://listingiq.test/api/analyze-photos', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        uploadId: 'upload_priority',
        sessionId: 'cs_priority',
      }),
    })

    const res = await photoPost(req)
    expect(res.status).toBe(200)

    // Should use uploaded photo filename
    const data = await res.json()
    expect(data.photos[0].filename).toBe('uploaded.jpg')

    // Stored photos should be cleaned up
    expect(mocks.deletePhotos).toHaveBeenCalledWith('upload_priority')
  })

  it('the route parses uploadId from JSON when photoUrls is absent', async () => {
    // When no photoUrls, the route falls to the uploadId branch
    mocks.getPhotos.mockReturnValue(null)

    const req = new NextRequest('https://listingiq.test/api/analyze-photos', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        uploadId: 'expired_upload',
        sessionId: 'cs_expired',
      }),
    })

    const res = await photoPost(req)
    // Should return 410 for expired photos (not 400 for missing input)
    expect(res.status).toBe(410)
    const data = await res.json()
    expect(data.error).toMatch(/expired/)
  })
})
