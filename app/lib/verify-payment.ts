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

    // 100% discount codes result in no payment required — always valid
    if (session.payment_status === 'no_payment_required') {
      return {
        valid: true,
        plan: session.metadata?.planKey || 'quick-score',
        captured: true, // no charge to capture
      }
    }

    const paymentIntentId = typeof session.payment_intent === 'string'
      ? session.payment_intent
      : session.payment_intent?.id

    // For uncaptured sessions, verify the payment intent is still capturable.
    // A cancelled PI (from a failed scrape) should NOT pass verification —
    // otherwise the customer can retry with the same session and get a free report.
    // Retry once after a short delay to handle Stripe propagation timing.
    let isAuthorized = false
    if (!isCaptured && session.payment_status === 'unpaid' && paymentIntentId) {
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const pi = await stripe.paymentIntents.retrieve(paymentIntentId)
          if (pi.status === 'requires_capture') {
            isAuthorized = true
            break
          }
          console.warn(`[verify-payment] PI ${paymentIntentId} status is '${pi.status}' (attempt ${attempt + 1})`)
          // Wait 1.5s before retrying — PI may still be transitioning
          if (attempt === 0) await new Promise(r => setTimeout(r, 1500))
        } catch (err) {
          console.error(`[verify-payment] Failed to retrieve PI ${paymentIntentId} (attempt ${attempt + 1}):`, err)
          if (attempt === 0) await new Promise(r => setTimeout(r, 1500))
        }
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
