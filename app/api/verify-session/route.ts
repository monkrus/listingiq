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

    // Accept both captured ('paid') and authorized-but-not-yet-captured
    // ('unpaid' with a payment_intent) — manual capture flow authorizes
    // the card at checkout and only captures after a successful analysis.
    const isCaptured = session.payment_status === 'paid'
    const isAuthorized = session.payment_status === 'unpaid' && !!session.payment_intent
    const isComplete = session.status === 'complete'

    if (isComplete && (isCaptured || isAuthorized)) {
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
