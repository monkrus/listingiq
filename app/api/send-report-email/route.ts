import { NextRequest, NextResponse } from 'next/server'
import { stripe } from '@/app/lib/stripe'
import { sendReceiptEmail } from '@/app/lib/email'
import { checkOrigin } from '@/app/lib/check-origin'
import { rateLimit } from '@/app/lib/rate-limit'
import { markEmailSent, isEmailSent, getCachedReportBySession, getSupabaseAdmin } from '@/app/lib/supabase'

// In-memory dedup (fast path — survives within a single process lifetime)
const sentEmails = new Set<string>()

export async function POST(req: NextRequest) {
  const originBlock = checkOrigin(req)
  if (originBlock) return originBlock

  // Rate limit: 3 email sends per minute per IP
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  const { limited } = rateLimit(ip, 3, 60_000)
  if (limited) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
  }

  const { sessionId } = await req.json()
  if (!sessionId) {
    return NextResponse.json({ error: 'Missing sessionId' }, { status: 400 })
  }

  // Fast dedup: in-memory check
  if (sentEmails.has(sessionId)) {
    return NextResponse.json({ sent: false, reason: 'already_sent' })
  }

  // Durable dedup: check Supabase (survives cold starts).
  // isEmailSent returns false when Supabase is unavailable — in that case,
  // only the in-memory Set guards against duplicates. After a restart with
  // Supabase down, we fail closed to prevent spam.
  const dbAvailable = !!getSupabaseAdmin()
  if (dbAvailable) {
    if (await isEmailSent(sessionId)) {
      sentEmails.add(sessionId)
      return NextResponse.json({ sent: false, reason: 'already_sent' })
    }
  } else if (!sentEmails.has(sessionId)) {
    // Supabase down + not in memory = can't verify dedup, fail closed
    console.warn('[send-report-email] Supabase unavailable for dedup, skipping send')
    return NextResponse.json({ sent: false, reason: 'dedup_unavailable' })
  }

  try {
    // Retrieve email from Stripe session (also validates the session exists)
    const session = await stripe.checkout.sessions.retrieve(sessionId)

    // Verify payment was completed
    if (session.payment_status !== 'paid') {
      return NextResponse.json({ sent: false, reason: 'not_paid' }, { status: 403 })
    }

    const email = session.customer_details?.email || session.metadata?.email
    const plan = session.metadata?.planKey || 'quick-score'

    if (!email) {
      return NextResponse.json({ sent: false, reason: 'no_email' })
    }

    // Fetch cached report to include content in the email
    const cached = await getCachedReportBySession(sessionId)
    const reportData = cached?.reportData as Record<string, unknown> | undefined

    await sendReceiptEmail({ to: email, plan, sessionId, reportData })

    // Mark as sent in both memory and Supabase
    sentEmails.add(sessionId)
    await markEmailSent(sessionId)

    return NextResponse.json({ sent: true })
  } catch (err) {
    console.error('[send-report-email] Error:', err)
    return NextResponse.json({ error: 'Failed to send email' }, { status: 500 })
  }
}
