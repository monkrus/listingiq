import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({
  constructEvent: vi.fn(),
  registerPaidSession: vi.fn(),
  getSupabaseAdmin: vi.fn(),
}))

vi.mock('@/app/lib/stripe', () => ({
  stripe: {
    webhooks: { constructEvent: mocks.constructEvent },
    checkout: { sessions: { retrieve: vi.fn(), update: vi.fn() } },
  },
}))

vi.mock('@/app/lib/session-usage', () => ({
  registerPaidSession: mocks.registerPaidSession,
  useAnalysisCredit: vi.fn(),
  usePhotoCredit: vi.fn(),
}))

vi.mock('@/app/lib/supabase', () => ({
  getSupabaseAdmin: mocks.getSupabaseAdmin,
}))

import { POST } from '@/app/api/webhook/route'

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('STRIPE_WEBHOOK_SECRET', 'whsec_test123')
})

function buildReq(body = '{}') {
  return new NextRequest('https://listingiq.test/api/webhook', {
    method: 'POST',
    headers: { 'stripe-signature': 'sig_test', 'content-type': 'application/json' },
    body,
  })
}

describe('/api/webhook', () => {
  it('registers session on checkout.session.completed', async () => {
    mocks.constructEvent.mockReturnValue({
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_completed_123',
          metadata: { planKey: 'full-audit' },
        },
      },
    })
    mocks.getSupabaseAdmin.mockReturnValue(null)

    const res = await POST(buildReq())
    expect(res.status).toBe(200)
    expect(mocks.registerPaidSession).toHaveBeenCalledWith('cs_completed_123', 'full-audit')
  })

  it('defaults to quick-score when planKey missing', async () => {
    mocks.constructEvent.mockReturnValue({
      type: 'checkout.session.completed',
      data: { object: { id: 'cs_no_plan', metadata: {} } },
    })
    mocks.getSupabaseAdmin.mockReturnValue(null)

    await POST(buildReq())
    expect(mocks.registerPaidSession).toHaveBeenCalledWith('cs_no_plan', 'quick-score')
  })

  it('returns 400 on invalid signature', async () => {
    mocks.constructEvent.mockImplementation(() => {
      throw new Error('Invalid signature')
    })

    const res = await POST(buildReq())
    expect(res.status).toBe(400)
  })

  it('returns 500 when STRIPE_WEBHOOK_SECRET not configured', async () => {
    vi.stubEnv('STRIPE_WEBHOOK_SECRET', '')

    // Re-import to pick up new env
    const mod = await import('@/app/api/webhook/route')
    const res = await mod.POST(buildReq())
    expect(res.status).toBe(500)
  })

  it('returns 200 for unhandled event types', async () => {
    mocks.constructEvent.mockReturnValue({ type: 'customer.updated', data: { object: {} } })

    const res = await POST(buildReq())
    expect(res.status).toBe(200)
    expect(mocks.registerPaidSession).not.toHaveBeenCalled()
  })

  it('handles invoice.payment_failed without crashing', async () => {
    mocks.constructEvent.mockReturnValue({
      type: 'invoice.payment_failed',
      data: { object: { customer: 'cus_123' } },
    })

    const res = await POST(buildReq())
    expect(res.status).toBe(200)
  })
})
