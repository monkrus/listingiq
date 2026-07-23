import { NextRequest, NextResponse } from 'next/server'
import { stripe } from '@/app/lib/stripe'
import { getSupabaseAdmin } from '@/app/lib/supabase'
import { registerPaidSession } from '@/app/lib/session-usage'
import { triggerReportEmail } from '@/app/lib/trigger-report-email'
import Stripe from 'stripe'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  const body = await req.text()
  const sig = req.headers.get('stripe-signature')!
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET

  // If webhook secret isn't configured, reject all webhook calls
  if (!webhookSecret || webhookSecret === 'whsec_your-secret-here') {
    console.error('[webhook] STRIPE_WEBHOOK_SECRET not configured — rejecting webhook')
    return NextResponse.json({ error: 'Webhook not configured' }, { status: 500 })
  }

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
        const planKey = session.metadata?.planKey || 'quick-score'
        // Register the session in our usage tracker so the API routes can validate it
        registerPaidSession(session.id, planKey)

        // Add credits if Supabase is configured and we can identify the user
        const db = getSupabaseAdmin()
        const userId = session.metadata?.userId
        if (db && userId && planKey) {
          const creditMap: Record<string, number> = { 'quick-score': 1, 'full-audit': 1 }
          const credits = creditMap[planKey] ?? 1
          await db.rpc('add_credits', { uid: userId, amount: credits })
        }

        // Safety-net email: if the user closed the browser before redirect,
        // the analyze route never fired triggerReportEmail. The dedup inside
        // triggerReportEmail prevents double-sends if it already ran.
        // Delay slightly so the analyze route has time to save the report first.
        setTimeout(() => {
          triggerReportEmail(session.id).catch(err =>
            console.warn('[webhook] Safety-net email failed:', err)
          )
        }, 15_000) // 15s delay — gives analyze route time to complete
        break
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice
        console.warn('[webhook] Payment failed for customer:', invoice.customer)
        break
      }

      default:
        break
    }
  } catch (err) {
    console.error('[webhook] Handler error:', err)
    return NextResponse.json({ error: 'Webhook handler failed' }, { status: 500 })
  }

  return NextResponse.json({ received: true })
}
