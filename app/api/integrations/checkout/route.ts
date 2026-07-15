import { NextRequest, NextResponse } from 'next/server'
import { stripe, PLANS } from '@/app/lib/stripe'

/**
 * POST /api/integrations/checkout
 * Body: { plan, platform, connectionId, propertyId }
 *
 * Creates a Stripe checkout session for PMS integration analysis.
 * After payment, redirects back to /{platform}?session_id=XXX&propertyId=YYY
 */
export async function POST(req: NextRequest) {
  const { plan, platform, propertyId } = await req.json()

  if (!plan || !platform || !propertyId) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  // connectionId is stored server-side in httpOnly cookie — read it for metadata only
  const connectionId = platform === 'hospitable'
    ? req.cookies.get('hospitable_connection_id')?.value
    : req.cookies.get('hostex_connection_id')?.value

  if (!connectionId) {
    return NextResponse.json({ error: 'Not connected. Please connect your account first.' }, { status: 401 })
  }

  if (!['hospitable', 'hostex'].includes(platform)) {
    return NextResponse.json({ error: 'Invalid platform' }, { status: 400 })
  }

  const isUpgrade = plan === 'full-audit-upgrade'
  const effectivePlan = isUpgrade ? 'full-audit' : plan

  const planConfig = PLANS[plan]
  if (!planConfig) {
    return NextResponse.json({ error: 'Invalid plan' }, { status: 400 })
  }

  const origin = process.env.NEXT_PUBLIC_BASE_URL || 'https://listingiq.pro'

  // Mock mode — skip Stripe
  if (process.env.USE_MOCK_API === 'true') {
    return NextResponse.json({
      url: `${origin}/${platform}?paid=1&plan=${effectivePlan}&propertyId=${propertyId}`,
    })
  }

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [{ price: planConfig.priceId, quantity: 1 }],
      success_url: `${origin}/${platform}?session_id={CHECKOUT_SESSION_ID}&plan=${effectivePlan}&propertyId=${encodeURIComponent(propertyId)}`,
      cancel_url: `${origin}/${platform}`,
      metadata: {
        planKey: effectivePlan,
        platform,
        connectionId,
        propertyId,
      },
      allow_promotion_codes: true,
      payment_intent_data: { capture_method: 'manual' },
    })

    return NextResponse.json({ url: session.url })
  } catch (err) {
    console.error('[integrations/checkout]', err)
    return NextResponse.json({ error: 'Failed to create checkout session' }, { status: 500 })
  }
}
