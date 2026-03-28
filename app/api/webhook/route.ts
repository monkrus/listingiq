import { NextRequest, NextResponse } from 'next/server'
import { stripe } from '@/app/lib/stripe'
import { getSupabaseAdmin } from '@/app/lib/supabase'
import Stripe from 'stripe'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  const body = await req.text()
  const sig = req.headers.get('stripe-signature')!
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(body, sig, webhookSecret)
  } catch (err) {
    console.error('[webhook] Signature verification failed:', err)
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  try {
    switch (event.type) {

      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session
        const planKey = session.metadata?.planKey
        const email = session.customer_details?.email || session.metadata?.email
        console.log(`[webhook] Checkout completed: plan=${planKey} email=${email}`)

        // Add credits if Supabase is configured and we can identify the user
        const db = getSupabaseAdmin()
        const userId = session.metadata?.userId
        if (db && userId && planKey) {
          const creditMap: Record<string, number> = { 'quick-score': 1, 'full-audit': 1 }
          const credits = creditMap[planKey] ?? 1
          await db.rpc('add_credits', { uid: userId, amount: credits })
          console.log(`[webhook] Credits added: user=${userId} credits=${credits}`)
        }
        break
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice
        console.warn('[webhook] Payment failed for customer:', invoice.customer)
        break
      }

      default:
        console.log(`[webhook] Unhandled event: ${event.type}`)
    }
  } catch (err) {
    console.error('[webhook] Handler error:', err)
    return NextResponse.json({ error: 'Webhook handler failed' }, { status: 500 })
  }

  return NextResponse.json({ received: true })
}
