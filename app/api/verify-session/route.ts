import { NextRequest, NextResponse } from 'next/server'
import { stripe } from '@/app/lib/stripe'
import { rateLimit } from '@/app/lib/rate-limit'

export async function GET(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  const { limited } = rateLimit(ip, 10, 60_000)
  if (limited) {
    return NextResponse.json({ verified: false, error: 'Too many requests' }, { status: 429 })
  }

  const sessionId = req.nextUrl.searchParams.get('session_id')

  if (!sessionId) {
    return NextResponse.json({ verified: false, error: 'Missing session_id' }, { status: 400 })
  }

  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId)

    if (session.status !== 'complete') {
      return NextResponse.json({ verified: false, error: 'Payment not completed' })
    }

    // Accept both captured ('paid') and authorized-but-not-yet-captured
    // ('unpaid' with a payment_intent in 'requires_capture' status).
    // Must match the strict check in verifyPayment so failures surface here
    // (with proper error UI) instead of later on the main page.
    const isCaptured = session.payment_status === 'paid'
    const isFree = session.payment_status === 'no_payment_required'

    let isAuthorized = false
    if (!isCaptured && !isFree && session.payment_status === 'unpaid') {
      const paymentIntentId = typeof session.payment_intent === 'string'
        ? session.payment_intent
        : session.payment_intent?.id
      if (paymentIntentId) {
        // Retry once after a short delay to handle Stripe propagation timing
        for (let attempt = 0; attempt < 2; attempt++) {
          try {
            const pi = await stripe.paymentIntents.retrieve(paymentIntentId)
            if (pi.status === 'requires_capture') {
              isAuthorized = true
              break
            }
            console.warn(`[verify-session] PI ${paymentIntentId} status is '${pi.status}' (attempt ${attempt + 1})`)
            if (attempt === 0) await new Promise(r => setTimeout(r, 1500))
          } catch (err) {
            console.error(`[verify-session] Failed to retrieve PI ${paymentIntentId} (attempt ${attempt + 1}):`, err)
            if (attempt === 0) await new Promise(r => setTimeout(r, 1500))
          }
        }
      }
    }

    if (isCaptured || isFree || isAuthorized) {
      return NextResponse.json({
        verified: true,
        plan: session.metadata?.planKey || 'quick-score',
        listingUrl: session.metadata?.listingUrl || '',
        photoUploadId: session.metadata?.photoUploadId || '',
      })
    }

    return NextResponse.json({ verified: false, error: 'Payment not completed' })
  } catch (err) {
    console.error('[verify-session]', err)
    return NextResponse.json({ verified: false, error: 'Invalid session' }, { status: 400 })
  }
}
