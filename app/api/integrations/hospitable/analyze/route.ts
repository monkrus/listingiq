import { NextRequest, NextResponse } from 'next/server'
import { fetchHospitableListingInputs, resolveToken } from '@/app/lib/integrations/hospitable-adapter'
import { analyzeListingInput, AnalysisError } from '@/app/lib/analyze-core'
import { verifyPayment } from '@/app/lib/verify-payment'
import { useAnalysisCredit } from '@/app/lib/session-usage'
import { rateLimit, dailyRateLimit } from '@/app/lib/rate-limit'
import { savePmsReport } from '@/app/lib/pms-reports'
import { cacheReport } from '@/app/lib/supabase'
import { logger } from '@/app/lib/logger'
import { stripe } from '@/app/lib/stripe'
import { triggerReportEmail } from '@/app/lib/trigger-report-email'

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'

  // Rate limiting
  const { limited } = rateLimit(ip, 5, 60_000)
  if (limited) {
    return NextResponse.json({ error: 'Too many requests. Please wait a moment.' }, { status: 429 })
  }
  const daily = await dailyRateLimit(ip, 'hospitable-analyze', 30)
  if (daily.limited) {
    return NextResponse.json({ error: 'Daily request limit reached. Please try again tomorrow.' }, { status: 429 })
  }

  const connectionId = req.cookies.get('hospitable_connection_id')?.value
  const { plan, propertyId, sessionId } = await req.json()

  if (!connectionId) {
    return NextResponse.json({ error: 'Not connected. Please connect your Hospitable account.' }, { status: 401 })
  }

  // Payment verification (skip in mock mode)
  if (process.env.USE_MOCK_API !== 'true') {
    if (!sessionId) {
      return NextResponse.json({ error: 'Payment required. Please select a plan first.' }, { status: 402 })
    }

    const payment = await verifyPayment(sessionId)
    if (!payment.valid) {
      return NextResponse.json({ error: payment.error || 'Payment verification failed' }, { status: 402 })
    }

    const credit = await useAnalysisCredit(sessionId, payment.plan)
    if (!credit.allowed) {
      return NextResponse.json({ error: credit.error || 'Credit already used' }, { status: 402 })
    }
  }

  // Resolve auth token from cookie-based connectionId
  let token: string
  try {
    token = await resolveToken(connectionId)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Connection error'
    logger.error('hospitable', 'token_resolve_failed', { connectionId, error: msg })
    return NextResponse.json({ error: msg }, { status: 401 })
  }

  const effectivePlan = plan || 'quick-score'

  let items
  try {
    items = await fetchHospitableListingInputs({
      token,
      propertyId,
      includeReviews: true,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    logger.error('hospitable', 'fetch_properties_failed', { connectionId, error: msg })

    // Cancel payment intent if scrape fails
    if (sessionId && process.env.USE_MOCK_API !== 'true') {
      try {
        const payment = await verifyPayment(sessionId)
        if (payment.paymentIntentId && !payment.captured) {
          await stripe.paymentIntents.cancel(payment.paymentIntentId)
        }
      } catch { /* best effort */ }
    }

    return NextResponse.json({ error: `Failed to fetch Hospitable properties: ${msg}` }, { status: 502 })
  }

  if (propertyId && items.length === 0) {
    return NextResponse.json({ error: `Property ${propertyId} not found in Hospitable account` }, { status: 404 })
  }

  const results = []
  for (const { input, readiness, raw } of items) {
    const id = raw.id

    if (readiness.mode === 'insufficient') {
      results.push({
        propertyId: id,
        skipped: true,
        reason: `Not enough listing content to audit (missing: ${readiness.missing.join(', ')})`,
      })
      continue
    }

    try {
      const report = await analyzeListingInput(input, {
        sourceLabel: 'data imported from Hospitable PMS',
      })

      // Persist the report
      const reportId = await savePmsReport({
        platform: 'hospitable',
        connectionId: connectionId || 'pat',
        propertyId: id,
        sessionId: sessionId || null,
        plan: effectivePlan,
        listingData: input,
        reportData: report,
        overallScore: (report.overallScore as number) ?? 0,
      })

      // Also create a cached_reports row so photo analysis, email dedup, and
      // email photo scores work (they all operate on cached_reports)
      if (sessionId) {
        await cacheReport(sessionId, effectivePlan, `hospitable://${id}`, report)
      }

      results.push({
        propertyId: id,
        readiness: readiness.mode,
        report,
        reportId,
        photoUrls: input.photoUrls,
        listing: {
          title: input.title,
          location: input.location,
          photoCount: input.photoCount,
          amenities: input.amenities?.slice(0, 5),
        },
      })
    } catch (err) {
      if (err instanceof AnalysisError) {
        results.push({
          propertyId: id,
          skipped: true,
          reason: err.message,
        })
        continue
      }
      // Unexpected error — cancel payment and surface to user
      if (sessionId && process.env.USE_MOCK_API !== 'true') {
        try {
          const payment = await verifyPayment(sessionId)
          if (payment.paymentIntentId && !payment.captured) {
            await stripe.paymentIntents.cancel(payment.paymentIntentId)
          }
        } catch { /* best effort */ }
      }
      logger.error('hospitable', 'analysis_failed', { propertyId: id, error: String(err) })
      return NextResponse.json({ error: 'Analysis failed. Your payment was not charged. Please try again.' }, { status: 500 })
    }
  }

  const hasResults = results.some(r => !r.skipped)

  // Capture payment only if at least one listing was actually analyzed
  if (sessionId && process.env.USE_MOCK_API !== 'true') {
    try {
      const payment = await verifyPayment(sessionId)
      if (payment.paymentIntentId && !payment.captured) {
        if (hasResults) {
          await stripe.paymentIntents.capture(payment.paymentIntentId)
        } else {
          await stripe.paymentIntents.cancel(payment.paymentIntentId)
          logger.warn('hospitable', 'payment_cancelled_all_skipped', { sessionId })
        }
      }
    } catch (err) {
      logger.error('hospitable', 'capture_failed', { sessionId, error: String(err) })
    }
  }

  // Send report email (fire-and-forget) — only if we have actual results
  // For full-audit, let analyze-photos be the sole sender (avoids double-send race)
  if (sessionId && hasResults && effectivePlan !== 'full-audit') {
    triggerReportEmail(sessionId).catch(err =>
      logger.error('hospitable', 'email_trigger_failed', { sessionId, error: String(err) })
    )
  }

  return NextResponse.json({ source: 'hospitable', count: results.length, results })
}
