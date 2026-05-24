import { describe, it, expect, vi, beforeEach } from 'vitest'

const retrieveSessionFn = vi.fn()
const retrievePiFn = vi.fn()

vi.mock('@/app/lib/stripe', () => ({
  stripe: {
    checkout: { sessions: { retrieve: (...args: any[]) => retrieveSessionFn(...args), update: vi.fn() } },
    paymentIntents: { retrieve: (...args: any[]) => retrievePiFn(...args) },
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
    retrieveSessionFn.mockResolvedValue({
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

  it('accepts authorized-not-captured session with requires_capture PI', async () => {
    retrieveSessionFn.mockResolvedValue({
      status: 'complete',
      payment_status: 'unpaid',
      payment_intent: 'pi_auth_456',
      metadata: { planKey: 'quick-score' },
    })
    retrievePiFn.mockResolvedValue({ status: 'requires_capture' })
    const result = await verifyPayment('cs_authorized')
    expect(result.valid).toBe(true)
    expect(result.captured).toBe(false)
    expect(result.paymentIntentId).toBe('pi_auth_456')
  })

  it('rejects cancelled payment intent (scrape failed, PI was cancelled)', async () => {
    retrieveSessionFn.mockResolvedValue({
      status: 'complete',
      payment_status: 'unpaid',
      payment_intent: 'pi_cancelled_789',
      metadata: { planKey: 'quick-score' },
    })
    retrievePiFn.mockResolvedValue({ status: 'canceled' })
    const result = await verifyPayment('cs_cancelled')
    expect(result.valid).toBe(false)
    expect(result.error).toContain('not completed')
  })

  it('rejects when PI retrieve fails (fail closed)', async () => {
    retrieveSessionFn.mockResolvedValue({
      status: 'complete',
      payment_status: 'unpaid',
      payment_intent: 'pi_error',
      metadata: {},
    })
    retrievePiFn.mockRejectedValue(new Error('Stripe error'))
    const result = await verifyPayment('cs_pi_error')
    expect(result.valid).toBe(false)
  })

  it('rejects incomplete session', async () => {
    retrieveSessionFn.mockResolvedValue({
      status: 'open',
      payment_status: 'unpaid',
      payment_intent: null,
      metadata: {},
    })
    const result = await verifyPayment('cs_open')
    expect(result.valid).toBe(false)
    expect(result.error).toContain('not completed')
  })

  it('accepts complete session with no_payment_required (100% discount)', async () => {
    retrieveSessionFn.mockResolvedValue({
      status: 'complete',
      payment_status: 'no_payment_required',
      payment_intent: null,
      metadata: { planKey: 'full-audit' },
    })
    const result = await verifyPayment('cs_free')
    expect(result.valid).toBe(true)
    expect(result.plan).toBe('full-audit')
    expect(result.captured).toBe(true)
  })

  it('defaults to quick-score when no planKey in metadata', async () => {
    retrieveSessionFn.mockResolvedValue({
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
    retrieveSessionFn.mockResolvedValue({
      status: 'complete',
      payment_status: 'paid',
      payment_intent: { id: 'pi_expanded_obj' },
      metadata: { planKey: 'full-audit' },
    })
    const result = await verifyPayment('cs_expanded')
    expect(result.valid).toBe(true)
    expect(result.paymentIntentId).toBe('pi_expanded_obj')
  })

  it('retries PI retrieval and succeeds on second attempt', async () => {
    retrieveSessionFn.mockResolvedValue({
      status: 'complete',
      payment_status: 'unpaid',
      payment_intent: 'pi_retry',
      metadata: { planKey: 'quick-score' },
    })
    retrievePiFn
      .mockResolvedValueOnce({ status: 'processing' })
      .mockResolvedValueOnce({ status: 'requires_capture' })
    const result = await verifyPayment('cs_retry')
    expect(result.valid).toBe(true)
    expect(retrievePiFn).toHaveBeenCalledTimes(2)
  })

  it('retries PI retrieval on network error and succeeds', async () => {
    retrieveSessionFn.mockResolvedValue({
      status: 'complete',
      payment_status: 'unpaid',
      payment_intent: 'pi_net_retry',
      metadata: { planKey: 'quick-score' },
    })
    retrievePiFn
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValueOnce({ status: 'requires_capture' })
    const result = await verifyPayment('cs_net_retry')
    expect(result.valid).toBe(true)
    expect(retrievePiFn).toHaveBeenCalledTimes(2)
  })

  it('returns invalid on Stripe API error', async () => {
    retrieveSessionFn.mockRejectedValue(new Error('Stripe API down'))
    const result = await verifyPayment('cs_error')
    expect(result.valid).toBe(false)
    expect(result.error).toContain('Invalid payment session')
  })
})
