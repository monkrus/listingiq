import { describe, it, expect, vi, beforeEach } from 'vitest'

const retrieveFn = vi.fn()

vi.mock('@/app/lib/stripe', () => ({
  stripe: {
    checkout: { sessions: { retrieve: (...args: any[]) => retrieveFn(...args), update: vi.fn() } },
  },
}))

import { verifyPayment } from '@/app/lib/verify-payment'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('verifyPayment', () => {
  it('rejects null sessionId', async () => {
    const result = await verifyPayment(null)
    expect(result.valid).toBe(false)
    expect(result.error).toContain('No payment session')
  })

  it('rejects undefined sessionId', async () => {
    const result = await verifyPayment(undefined)
    expect(result.valid).toBe(false)
  })

  it('rejects empty string sessionId', async () => {
    const result = await verifyPayment('')
    expect(result.valid).toBe(false)
  })

  it('accepts captured (paid) session', async () => {
    retrieveFn.mockResolvedValue({
      status: 'complete',
      payment_status: 'paid',
      payment_intent: 'pi_123',
      metadata: { planKey: 'full-audit' },
    })
    const result = await verifyPayment('cs_valid')
    expect(result.valid).toBe(true)
    expect(result.plan).toBe('full-audit')
    expect(result.captured).toBe(true)
    expect(result.paymentIntentId).toBe('pi_123')
  })

  it('accepts authorized-not-captured session', async () => {
    retrieveFn.mockResolvedValue({
      status: 'complete',
      payment_status: 'unpaid',
      payment_intent: 'pi_auth_456',
      metadata: { planKey: 'quick-score' },
    })
    const result = await verifyPayment('cs_authorized')
    expect(result.valid).toBe(true)
    expect(result.captured).toBe(false)
    expect(result.paymentIntentId).toBe('pi_auth_456')
  })

  it('rejects incomplete session', async () => {
    retrieveFn.mockResolvedValue({
      status: 'open',
      payment_status: 'unpaid',
      payment_intent: null,
      metadata: {},
    })
    const result = await verifyPayment('cs_open')
    expect(result.valid).toBe(false)
    expect(result.error).toContain('not completed')
  })

  it('rejects complete session with no_payment_required and no PI', async () => {
    retrieveFn.mockResolvedValue({
      status: 'complete',
      payment_status: 'no_payment_required',
      payment_intent: null,
      metadata: {},
    })
    const result = await verifyPayment('cs_free')
    expect(result.valid).toBe(false)
  })

  it('defaults to quick-score when no planKey in metadata', async () => {
    retrieveFn.mockResolvedValue({
      status: 'complete',
      payment_status: 'paid',
      payment_intent: 'pi_789',
      metadata: {},
    })
    const result = await verifyPayment('cs_no_plan')
    expect(result.valid).toBe(true)
    expect(result.plan).toBe('quick-score')
  })

  it('handles payment_intent as object (Stripe expanded)', async () => {
    retrieveFn.mockResolvedValue({
      status: 'complete',
      payment_status: 'paid',
      payment_intent: { id: 'pi_expanded_obj' },
      metadata: { planKey: 'full-audit' },
    })
    const result = await verifyPayment('cs_expanded')
    expect(result.valid).toBe(true)
    expect(result.paymentIntentId).toBe('pi_expanded_obj')
  })

  it('returns invalid on Stripe API error', async () => {
    retrieveFn.mockRejectedValue(new Error('Stripe API down'))
    const result = await verifyPayment('cs_error')
    expect(result.valid).toBe(false)
    expect(result.error).toContain('Invalid payment session')
  })
})
