import { NextRequest, NextResponse } from 'next/server'
import { stripe, PLANS } from '@/app/lib/stripe'

export async function GET(req: NextRequest) {
  const plan = req.nextUrl.searchParams.get('plan') || 'quick-score'
  const listingUrl = req.nextUrl.searchParams.get('url') || ''
  const uploadId = req.nextUrl.searchParams.get('uploadId') || ''
  const upgrade = req.nextUrl.searchParams.get('upgrade') === '1'
  // Never use client-provided Origin header — hardcode the base URL
  const origin = process.env.NEXT_PUBLIC_BASE_URL || req.nextUrl.origin

  // Mock mode — skip Stripe
  if (process.env.USE_MOCK_API === 'true') {
    if (upgrade && listingUrl) {
      return NextResponse.redirect(`${origin}/?paid=1&plan=${plan}`)
    }
    return NextResponse.redirect(`${origin}/success?plan=${plan}&paid=1`)
  }

  // Production — create a real Stripe Checkout session
  const planConfig = PLANS[plan]
  if (!planConfig) {
    return NextResponse.json({ error: 'Invalid plan' }, { status: 400 })
  }

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [{ price: planConfig.priceId, quantity: 1 }],
      success_url: `${origin}/success?session_id={CHECKOUT_SESSION_ID}&plan=${plan}`,
      cancel_url: `${origin}${listingUrl ? `/?url=${encodeURIComponent(listingUrl)}` : '/pricing'}`,
      metadata: { planKey: plan, listingUrl, ...(uploadId ? { photoUploadId: uploadId } : {}) },
      allow_promotion_codes: true,
    })

    return NextResponse.redirect(session.url!)
  } catch (err) {
    console.error('[checkout-redirect]', err)
    return NextResponse.json({ error: 'Failed to create checkout session' }, { status: 500 })
  }
}
