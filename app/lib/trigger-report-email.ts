import { stripe } from '@/app/lib/stripe'
import { sendReceiptEmail } from '@/app/lib/email'
import { markEmailSent, isEmailSent, getCachedReportBySession, getSupabaseAdmin } from '@/app/lib/supabase'

// In-memory dedup (fast path — survives within a single process lifetime)
const sentEmails = new Set<string>()

/**
 * Core email-sending logic, shared by the HTTP route and server-side callers
 * (analyze / analyze-photos routes). Returns { sent, reason? } without
 * HTTP concerns so callers can decide how to surface the result.
 */
export async function triggerReportEmail(sessionId: string): Promise<{ sent: boolean; reason?: string }> {
  // Fast dedup: in-memory check
  if (sentEmails.has(sessionId)) {
    return { sent: false, reason: 'already_sent' }
  }

  // Durable dedup: check Supabase (survives cold starts)
  const dbAvailable = !!getSupabaseAdmin()
  if (dbAvailable) {
    if (await isEmailSent(sessionId)) {
      sentEmails.add(sessionId)
      return { sent: false, reason: 'already_sent' }
    }
  } else if (!sentEmails.has(sessionId)) {
    console.warn('[send-report-email] Supabase unavailable for dedup, skipping send')
    return { sent: false, reason: 'dedup_unavailable' }
  }

  // Retrieve email from Stripe session (also validates the session exists)
  const session = await stripe.checkout.sessions.retrieve(sessionId)

  if (session.status !== 'complete') {
    return { sent: false, reason: 'not_paid' }
  }

  const email = session.customer_details?.email || session.metadata?.email
  const plan = session.metadata?.planKey || 'quick-score'
  const platform = session.metadata?.platform as string | undefined

  if (!email) {
    return { sent: false, reason: 'no_email' }
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

  await sendReceiptEmail({ to: email, plan, sessionId, reportData, photoScore, platform })

  // Mark as sent in both memory and Supabase
  sentEmails.add(sessionId)
  await markEmailSent(sessionId)

  return { sent: true }
}
