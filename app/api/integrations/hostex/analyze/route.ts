import { NextRequest, NextResponse } from 'next/server'
import { getHostexConnection } from '@/app/lib/supabase'
import { fetchHostexListingInputs } from '@/app/lib/integrations/hostex-adapter'
import { analyzeListingInput, AnalysisError } from '@/app/lib/analyze-core'
import { verifyPayment } from '@/app/lib/verify-payment'
import { useAnalysisCredit } from '@/app/lib/session-usage'
import { rateLimit, dailyRateLimit } from '@/app/lib/rate-limit'
import { savePmsReport } from '@/app/lib/pms-reports'
import { logger } from '@/app/lib/logger'
import { stripe } from '@/app/lib/stripe'

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'

  // Rate limiting
  const { limited } = rateLimit(ip, 5, 60_000)
  if (limited) {
    return NextResponse.json({ error: 'Too many requests. Please wait a moment.' }, { status: 429 })
  }
  const daily = await dailyRateLimit(ip, 'hostex-analyze', 30)
  if (daily.limited) {
    return NextResponse.json({ error: 'Daily request limit reached. Please try again tomorrow.' }, { status: 429 })
  }

  const { connectionId, accessToken: rawToken, plan, listingId, sessionId } = await req.json()

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

  // Resolve auth token
  let accessToken: string
  if (connectionId) {
    const token = await getHostexConnection(connectionId)
    if (!token) {
      return NextResponse.json({ error: 'Connection not found. Please reconnect.' }, { status: 401 })
    }
    accessToken = token
  } else if (rawToken) {
    accessToken = rawToken
  } else {
    return NextResponse.json({ error: 'Missing connectionId or accessToken' }, { status: 400 })
  }

  const effectivePlan = plan || 'quick-score'

  let items
  try {
    items = await fetchHostexListingInputs({ accessToken, channelType: 'airbnb' })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    logger.error('hostex', 'fetch_listings_failed', { connectionId, error: msg })

    // Cancel payment intent if fetch fails
    if (sessionId && process.env.USE_MOCK_API !== 'true') {
      try {
        const payment = await verifyPayment(sessionId)
        if (payment.paymentIntentId && !payment.captured) {
          await stripe.paymentIntents.cancel(payment.paymentIntentId)
        }
      } catch { /* best effort */ }
    }

    return NextResponse.json({ error: `Failed to fetch Hostex listings: ${msg}` }, { status: 502 })
  }

  // Optionally narrow to one listing
  const targets = listingId
    ? items.filter((i) => String(i.raw.listing_id ?? i.raw.id) === String(listingId))
    : items

  if (listingId && targets.length === 0) {
    return NextResponse.json({ error: `Listing ${listingId} not found in Hostex account` }, { status: 404 })
  }

  const results = []
  for (const { input, readiness, raw } of targets) {
    const id = raw.listing_id ?? raw.id

    if (readiness.mode === 'insufficient') {
      results.push({
        listingId: id,
        skipped: true,
        reason: `Not enough listing content to audit (missing: ${readiness.missing.join(', ')})`,
      })
      continue
    }

    try {
      const report = await analyzeListingInput(input, {
        sourceLabel: 'data imported from Hostex PMS',
      })

      const result = {
        listingId: id,
        readiness: readiness.mode,
        report,
        photoUrls: input.photoUrls,
        listing: {
          title: input.title,
          location: input.location,
          photoCount: input.photoCount,
          amenities: input.amenities?.slice(0, 5),
        },
      }
      results.push(result)

      // Persist the report
      await savePmsReport({
        platform: 'hostex',
        connectionId: connectionId || 'manual',
        propertyId: id,
        sessionId: sessionId || null,
        plan: effectivePlan,
        listingData: input,
        reportData: report,
        overallScore: (report.overallScore as number) ?? 0,
      })
    } catch (err) {
      if (err instanceof AnalysisError) {
        results.push({
          listingId: id,
          skipped: true,
          reason: err.message,
        })
        continue
      }
      throw err
    }
  }

  // Capture payment after successful analysis
  if (sessionId && process.env.USE_MOCK_API !== 'true') {
    try {
      const payment = await verifyPayment(sessionId)
      if (payment.paymentIntentId && !payment.captured) {
        await stripe.paymentIntents.capture(payment.paymentIntentId)
      }
    } catch (err) {
      logger.error('hostex', 'capture_failed', { sessionId, error: String(err) })
    }
  }

  return NextResponse.json({ source: 'hostex', count: results.length, results })
}
