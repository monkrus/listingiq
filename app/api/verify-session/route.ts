import { NextRequest, NextResponse } from 'next/server'
import { stripe } from '@/app/lib/stripe'

export async function GET(req: NextRequest) {
  const sessionId = req.nextUrl.searchParams.get('session_id')

  if (!sessionId) {
    return NextResponse.json({ verified: false, error: 'Missing session_id' }, { status: 400 })
  }

  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId)

    if (session.payment_status === 'paid') {
      return NextResponse.json({
        verified: true,
        plan: session.metadata?.planKey || 'quick-score',
        listingUrl: session.metadata?.listingUrl || '',
      })
    }

    return NextResponse.json({ verified: false, error: 'Payment not completed' })
  } catch (err) {
    console.error('[verify-session]', err)
    return NextResponse.json({ verified: false, error: 'Invalid session' }, { status: 400 })
  }
}
