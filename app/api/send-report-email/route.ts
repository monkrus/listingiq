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

    // Verify checkout was completed. Use session.status (not payment_status)
    // because manual capture flow keeps payment_status as 'unpaid' until the
    // PI is captured, which may not have propagated yet when this runs.
    if (session.status !== 'complete') {
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

    // For Full Audit, recalculate overall score with photo weighting to match the web report
    if (reportData && plan === 'full-audit' && cached?.photoResults) {
      const pr = cached.photoResults as Record<string, unknown>
      const photoScore = typeof pr.overallPhotoScore === 'number' ? pr.overallPhotoScore : null
      if (photoScore !== null) {
        const d = reportData as Record<string, number>
        const weighted = Math.round(
          (d.titleScore ?? 0) * 0.17 +
          (d.descriptionScore ?? 0) * 0.22 +
          photoScore * 0.15 +
          (d.amenityScore ?? 0) * 0.17 +
          (d.personaScore ?? 0) * 0.12 +
          (d.reviewScore ?? 0) * 0.17
        )
        reportData.overallScore = weighted
      }
    }

    // Pass photo score so email includes it in sub-scores for Full Audit
    const photoScore = cached?.photoResults
      ? (cached.photoResults as Record<string, unknown>).overallPhotoScore as number | undefined
      : undefined

    await sendReceiptEmail({ to: email, plan, sessionId, reportData, photoScore })

    // Mark as sent in both memory and Supabase
    sentEmails.add(sessionId)
    await markEmailSent(sessionId)

    return NextResponse.json({ sent: true })
  } catch (err) {
    console.error('[send-report-email] Error:', err)
    return NextResponse.json({ error: 'Failed to send email' }, { status: 500 })
  }
}
