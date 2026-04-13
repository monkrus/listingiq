import { stripe } from './stripe'

/**
 * Verify that a Stripe checkout session is valid.
 *
 * Supports manual capture flow: a session is considered valid if the user
 * has completed checkout and the payment is either:
 *   - captured ('paid'), OR
 *   - authorized but not yet captured ('unpaid' + payment_intent in
 *     'requires_capture' status — NOT cancelled)
 *
 * Returns the payment_intent ID so the analyze route can capture it after
 * a successful analysis or cancel it on scrape failure.
 */
export async function verifyPayment(
  sessionId: string | null | undefined
): Promise<{
  valid: boolean
  plan: string
  paymentIntentId?: string
  captured?: boolean
  error?: string
}> {
  if (!sessionId) {
    return { valid: false, plan: '', error: 'No payment session provided' }
  }

  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId)

    if (session.status !== 'complete') {
      return { valid: false, plan: '', error: 'Payment not completed' }
    }

    const isCaptured = session.payment_status === 'paid'

    const paymentIntentId = typeof session.payment_intent === 'string'
      ? session.payment_intent
      : session.payment_intent?.id

    // For uncaptured sessions, verify the payment intent is still capturable.
    // A cancelled PI (from a failed scrape) should NOT pass verification —
    // otherwise the customer can retry with the same session and get a free report.
    let isAuthorized = false
    if (!isCaptured && session.payment_status === 'unpaid' && paymentIntentId) {
      try {
        const pi = await stripe.paymentIntents.retrieve(paymentIntentId)
        isAuthorized = pi.status === 'requires_capture'
      } catch {
        // If we can't check the PI, fail closed
        isAuthorized = false
      }
    }

    if (!isCaptured && !isAuthorized) {
      return { valid: false, plan: '', error: 'Payment not completed' }
    }

    return {
      valid: true,
      plan: session.metadata?.planKey || 'quick-score',
      paymentIntentId,
      captured: isCaptured,
    }
  } catch {
    return { valid: false, plan: '', error: 'Invalid payment session' }
  }
}
