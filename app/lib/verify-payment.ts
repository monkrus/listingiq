import { stripe } from './stripe'

/**
 * Verify that a Stripe checkout session has been paid.
 * Used by API routes to gate access to paid features.
 */
export async function verifyPayment(
  sessionId: string | null | undefined
): Promise<{ valid: boolean; plan: string; error?: string }> {
  if (!sessionId) {
    return { valid: false, plan: '', error: 'No payment session provided' }
  }

  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId)

    if (session.payment_status !== 'paid') {
      return { valid: false, plan: '', error: 'Payment not completed' }
    }

    return {
      valid: true,
      plan: session.metadata?.planKey || 'quick-score',
    }
  } catch {
    return { valid: false, plan: '', error: 'Invalid payment session' }
  }
}
