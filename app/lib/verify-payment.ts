import { stripe } from './stripe'

/**
 * Verify that a Stripe checkout session is valid.
 *
 * Supports manual capture flow: a session is considered valid if the user
 * has completed checkout and the payment is either:
 *   - captured ('paid'), OR
 *   - authorized but not yet captured ('unpaid' + has payment_intent)
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
    const isAuthorized = session.payment_status === 'unpaid' && !!session.payment_intent

    if (!isCaptured && !isAuthorized) {
      return { valid: false, plan: '', error: 'Payment not completed' }
    }

    const paymentIntentId = typeof session.payment_intent === 'string'
      ? session.payment_intent
      : session.payment_intent?.id

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
