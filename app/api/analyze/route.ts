import { NextRequest, NextResponse } from 'next/server'
import { ListingInput } from '@/app/lib/types'
import { scrapeAirbnbListing, isValidAirbnbUrl } from '@/app/lib/scraper'
import { saveReport, cacheReport, getCachedReportBySession } from '@/app/lib/supabase'
import { verifyPayment } from '@/app/lib/verify-payment'
import { rateLimit, dailyRateLimit } from '@/app/lib/rate-limit'
import { useAnalysisCredit } from '@/app/lib/session-usage'
import { checkOrigin } from '@/app/lib/check-origin'
import { getCachedReport, setCachedReport } from '@/app/lib/report-cache'
import { stripe } from '@/app/lib/stripe'
import { estimateImprovement } from '@/app/lib/estimate-improvement'
import { analyzeListingInput, AnalysisError } from '@/app/lib/analyze-core'
import { logAnalyticsEvent } from '@/app/lib/analytics'
import { triggerReportEmail } from '@/app/lib/trigger-report-email'

/**
 * Capture a manually-authorized payment intent. No-op if already captured
 * or if the PI is missing. Errors are logged but not thrown — the customer
 * already has their report, and a capture failure is a billing exception
 * we handle out-of-band via logs.
 */
async function capturePaymentIntent(paymentIntentId: string | undefined, alreadyCaptured: boolean | undefined) {
  if (!paymentIntentId || alreadyCaptured) return
  try {
    await stripe.paymentIntents.capture(paymentIntentId)
  } catch (err) {
    console.error('[analyze] Failed to capture payment intent:', paymentIntentId, err)
  }
}

/**
 * Cancel a manually-authorized payment intent. Used when the scraper fails
 * and we couldn't deliver a report. No-op if already captured (can't cancel
 * a completed charge) or missing.
 */
async function cancelPaymentIntent(paymentIntentId: string | undefined, alreadyCaptured: boolean | undefined) {
  if (!paymentIntentId || alreadyCaptured) return
  try {
    await stripe.paymentIntents.cancel(paymentIntentId)
  } catch (err) {
    console.error('[analyze] Failed to cancel payment intent:', paymentIntentId, err)
  }
}

const USE_MOCK = process.env.USE_MOCK_API === 'true'

const MOCK_REPORT = {
  overallScore: 72,
  estimatedImprovement: 'Good — meaningful gains from the changes below',
  summary: 'A strong NEC/CBS niche listing with a killer unique selling point (hot tub) but held back by a thin description and missed business-traveller amenities.',
  priorityActions: [
    'Rewrite your description — it reads like a feature list. Paint the guest experience: arriving after a long NEC day, sinking into the hot tub, cooking dinner in the kitchen. Use the full rewrite below.',
    'Add a dedicated workspace mention — you target business travellers and contractors but don\'t mention desk space, fast Wi-Fi speed, or charging points.',
    'Add self check-in with a key safe or smart lock — contractors and event visitors often arrive at odd hours and this is expected for entire-home listings.',
    'Add a "What\'s Nearby" section with your exact drive times to NEC, CBS Arena, Birmingham Airport, and local pubs/restaurants.',
    'Weave both guest personas into your description naturally — mention what business guests care about (Wi-Fi speed, desk, parking, NEC distance) alongside what couples want (hot tub, local restaurants, Warwick Castle) so each type sees themselves.',
  ],
  titleScore: 71,
  titleProblems: [
    'Title front-loads "Hot Tub House" which is great, but the pipe and bullet separators (| •) look cluttered on mobile and get cut off in search results',
    '"Events" is too vague — guests searching don\'t type "events", they type "NEC exhibition" or "CBS Arena concert"',
    'Adding "Entire House" to the title helps guests instantly see it matches their search — it improves click-through when they\'re filtering by property type',
  ],
  titleSuggestions: [
    'Hot Tub House · NEC & CBS Arena · Parking',
    'Private Hot Tub · Near NEC · Sleeps 5',
    'NEC Hot Tub House · 3 Free Parking',
  ],
  descriptionScore: 52,
  descriptionProblems: [
    'Description reads like a bullet-point feature list rather than painting a picture of the guest experience — it doesn\'t sell the feeling of staying here',
    'No mention of specific distances or drive times to NEC, CBS Arena, or Birmingham Airport — these are the main reasons guests book',
    'Rooms described as "small" — this plants doubt. Reframe as "cosy" or just describe what\'s in them without the size qualifier',
  ],
  descriptionRewrite:
    'Your own private house with a hot tub — the perfect home base near the NEC.\n\nAfter a long day at the NEC Exhibition Centre or CBS Arena, unwind in your private hot tub before settling in for the evening. This is a whole house to yourself in Warwickshire — just [X min] from the NEC and [X min] from Birmingham Airport.\n\nThe house sleeps 5 across two cosy double bedrooms and a single room — ideal for a couple\'s getaway, a solo business trip, or a small contractor team. The fully equipped kitchen means you can cook dinner instead of hunting for restaurants after a tiring day, and the lounge is a proper space to relax with the TV.\n\nParking is never a problem — the driveway fits 3 cars, so you and your colleagues can all drive separately. The M6 motorway is [X min] away, making Coventry, Leamington Spa, and Warwick all within easy reach.\n\nWhether you\'re here for a trade show, a concert at the CBS Arena, or simply want a relaxing break in the Warwickshire countryside, this house gives you space, privacy, and comfort.\n\nWe\'d love to host you — check out our reviews and get in touch if you have any questions!',
  photoScore: 38,
  photoCount: 8,
  missingPhotos: [
    'Hero shot of key selling point (e.g. hot tub, garden) with evening lighting for atmosphere',
    'Individual bedroom photos with clean bedding and natural light',
    'Kitchen detail shot showing equipment and worktop space',
    'Outdoor area or garden — guests look for usable outdoor space',
    'Parking area or street view — business travellers want to confirm parking before booking',
  ],
  amenityScore: 62,
  topAmenities: ['Private hot tub', 'Free parking (3 cars)', 'Full kitchen'],
  amenityGaps: ['Self check-in / key safe or smart lock', 'Dedicated workspace or desk for contractors', 'Wi-Fi speed listed in Mbps (business travellers check this)'],
  personaScore: 68,
  primaryPersona: 'Event visitors attending NEC exhibitions and CBS Arena shows',
  personaProblems: [
    'Listing mentions contractors but doesn\'t highlight contractor-friendly amenities — washing machine, early check-in flexibility, or weekly discounts for longer stays',
    'Couples are mentioned but the listing doesn\'t lean into the romantic hot tub angle — no mention of local restaurants, pubs, or date-night spots nearby',
  ],
  personaSuggestion: 'Weave both personas into your description naturally: mention what business guests need (Wi-Fi speed, workspace, parking, NEC distance) alongside what couples want (hot tub, local restaurants, Warwick Castle). One flowing narrative that speaks to multiple audiences works better than rigidly labelled sections.',
  competitorInsight: 'Top-performing listings near event venues typically include exact drive times in their first description line and offer self check-in as standard. A private hot tub is a strong differentiator — to maximise it, consider mentioning specific events by name (e.g. "Great base for Crufts, Spring Fair, or Motorcycle Live") as guests searching for these events may find your listing more relevant.',
  reviewScore: 92,
  guestLoves: ['Hot tub experience', 'Proximity to NEC/CBS Arena', 'Clean and well-maintained'],
  reviewRisks: [
    'Based on available reviews: maintaining a high rating is critical for search ranking — consider a printed guest guide to pre-empt common questions and protect your score.',
    'Ensure the listing clearly explains room sizes and capacity upfront to avoid expectation mismatch in future reviews.',
  ],
  seoKeywords: ['NEC Airbnb with hot tub', 'hot tub house near NEC Birmingham', 'CBS Arena accommodation', 'Warwickshire hot tub rental', 'NEC exhibition accommodation', 'Birmingham Airport Airbnb', 'contractor accommodation near NEC'],
  conversionTips: [
    'Add your best 5-star review quote to the very first line of your description — social proof in the opening line builds instant trust',
    'Offer a 10-15% weekly discount to capture contractor stays of 5+ days — this market is price-sensitive but books longer',
    'Mention specific NEC events in your description (Crufts, Spring Fair, Motorcycle Live) — guests attending these events may find your listing more relevant when browsing',
    'Add exact drive times to key venues: NEC, CBS Arena, Birmingham Airport, nearest motorway junction — guests want to plan their journey before booking',
    'Lead your description with your strongest differentiator (the hot tub) — it\'s what sets you apart and should hook guests in the first line',
  ],
  wasScraped: false,
}

export async function POST(req: NextRequest) {
  // Hoisted so the outer catch / finally can release the authorization
  // even if we fail before reaching an explicit capture/cancel call.
  let paymentIntentId: string | undefined
  let alreadyCaptured: boolean | undefined
  // Flipped to true after we explicitly capture (delivery) or cancel (failure).
  // If we fall out of the try with settled === false, the finally cancels the
  // authorization so the customer's card hold is released immediately instead
  // of sitting for ~7 days until Stripe auto-voids it.
  let settled = false
  const startTime = Date.now()
  try {
    // Origin check — reject requests from external sites
    const originBlock = checkOrigin(req)
    if (originBlock) return originBlock

    // Rate limit: 5 requests per minute per IP (burst) + 50 per day (persistent)
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
    const { limited } = rateLimit(ip, 5, 60_000)
    if (limited) {
      return NextResponse.json({ error: 'Too many requests. Please wait a minute and try again.' }, { status: 429 })
    }
    const daily = await dailyRateLimit(ip, 'analyze', 50)
    if (daily.limited) {
      return NextResponse.json({ error: 'Daily request limit reached. Please try again tomorrow.' }, { status: 429 })
    }

    const body: ListingInput & { userId?: string; sessionId?: string; plan?: string; reaccess?: boolean } = await req.json()
    const plan = body.plan || 'quick-score'

    // Enforce input length limits (defense-in-depth against prompt injection and token overflow)
    if (body.title && body.title.length > 300) body.title = body.title.slice(0, 300)
    if (body.description && body.description.length > 10_000) body.description = body.description.slice(0, 10_000)
    if (body.amenities) body.amenities = body.amenities.slice(0, 100)
    if (body.reviews) body.reviews = body.reviews.slice(0, 50).map(r => r.slice(0, 1000))

    // Demo mode — always allow so the demo button works regardless of mock/live mode
    const isDemo = body.isDemo === true

    // Verify payment for non-demo, non-mock requests
    const isDev = process.env.NODE_ENV === 'development'
    let cacheOnly = false
    if (!isDemo && !USE_MOCK && !isDev) {
      const payment = await verifyPayment(body.sessionId)
      if (!payment.valid) {
        return NextResponse.json({ error: payment.error || 'Payment required' }, { status: 403 })
      }
      paymentIntentId = payment.paymentIntentId
      alreadyCaptured = payment.captured
      // Check session usage limits (prevent session ID reuse, allow re-access from email)
      const credit = await useAnalysisCredit(body.sessionId!, payment.plan || plan, { reaccess: body.reaccess })
      if (!credit.allowed) {
        return NextResponse.json({ error: credit.error }, { status: 403 })
      }
      if (credit.cacheOnly) cacheOnly = true
    }

    // Re-access: try Supabase cache first (survives deploys, works cross-browser)
    if (body.reaccess && body.sessionId) {
      const cached = await getCachedReportBySession(body.sessionId)
      if (cached) {
        // Safety net: if the initial analysis capture failed (rare), capture
        // now. No-op if already captured.
        await capturePaymentIntent(paymentIntentId, alreadyCaptured)
        settled = true
        return NextResponse.json({
          ...cached.reportData,
          cachedPhotoResults: cached.photoResults,
          cachedPhotoPreviews: cached.photoPreviews,
        })
      }
      // Re-access + credit already used + cache miss → refuse to re-bill.
      // Falling through to a fresh Claude call here would let a broken cache
      // write re-burn the API on every email click. Support handles genuine
      // "first attempt failed after payment" cases out-of-band.
      if (cacheOnly) {
        console.error(`[analyze] re-access cache miss for session=${body.sessionId} — refusing to re-bill`)
        // Capture the payment if not already: the customer paid and we owe
        // them the report — support will deliver it manually.
        await capturePaymentIntent(paymentIntentId, alreadyCaptured)
        settled = true
        return NextResponse.json(
          {
            error:
              'Your saved report is no longer available for automatic re-access. Please email hello@listingiq.pro with your receipt and we will restore it for you.',
          },
          { status: 410 }
        )
      }
    }

    // Return mock data for demo or when USE_MOCK_API is enabled
    if (isDemo || USE_MOCK) {
      settled = true // no paymentIntentId in these modes — nothing to release
      return NextResponse.json({
        ...MOCK_REPORT,
        estimatedImprovement: estimateImprovement(MOCK_REPORT.overallScore),
      })
    }

    let listing: ListingInput = body
    let wasScraped = false

    // If a real Airbnb URL is provided (not demo), attempt to scrape it
    if (!body.isDemo && body.url && isValidAirbnbUrl(body.url)) {
      const scraped = await scrapeAirbnbListing(body.url)

      if (scraped.scrapeSuccess && scraped.title) {
        listing = scraped
        wasScraped = true
      } else {
        console.warn('[analyze] Scrape failed, falling back to AI inference:', scraped.scrapeError)
        listing = body
      }
    }

    // Ensure we have enough data for a meaningful analysis
    if (!listing.title && !listing.description) {
      // Scrape failed — cancel the authorized payment so the customer is
      // never charged for a report we can't deliver.
      await cancelPaymentIntent(paymentIntentId, alreadyCaptured)
      settled = true
      return NextResponse.json(
        {
          error: 'Could not access your listing. Your payment has been cancelled — your card was not charged. Please double-check the URL and try again.',
        },
        { status: 422 }
      )
    }

    // Check cache — return identical result for same listing + plan within 24h
    const listingUrl = body.url || ''
    if (!body.isDemo && listingUrl) {
      const cached = getCachedReport(listingUrl, plan) as Record<string, unknown> | null
      if (cached) {
        // CRITICAL: persist to Supabase BEFORE capturing payment. If the
        // Supabase write fails, the customer would be charged but unable
        // to re-access their report via email. By writing first, we ensure
        // the data is durable before taking money.
        if (body.sessionId) {
          try {
            await cacheReport(body.sessionId, plan, listingUrl, cached)
          } catch (err) {
            console.error('[analyze] Failed to cache LRU-hit report to Supabase:', err)
          }
        }
        // Now capture the payment — report is safely cached for re-access
        await capturePaymentIntent(paymentIntentId, alreadyCaptured)
        settled = true
        logAnalyticsEvent({ route: 'analyze', plan, success: true, duration_ms: Date.now() - startTime, cache_hit: true })
        return NextResponse.json(cached)
      }
    }

    let report
    try {
      report = await analyzeListingInput(listing, {
        sourceLabel: wasScraped ? 'data auto-extracted from the listing page' : undefined,
      })
    } catch (err) {
      if (err instanceof AnalysisError) {
        if (err.code === 'EMPTY_PROMPT') {
          await cancelPaymentIntent(paymentIntentId, alreadyCaptured)
          settled = true
        }
        return NextResponse.json({ error: err.message }, { status: err.statusCode })
      }
      throw err
    }

    // Save to Supabase if user is authenticated
    if (body.userId) {
      await saveReport(
        body.userId,
        body.url ?? 'demo',
        listing,
        report,
        report.overallScore as number
      ).catch(err => console.warn('[analyze] Failed to save report:', err))
    }

    // Include photo URLs so client can auto-analyze listing photos for Full Audit
    const photoUrls = listing.photoUrls?.length ? listing.photoUrls : undefined
    const fullReport = { ...report, wasScraped, plan, photoUrls, listingUrl }

    // Cache the full response (LRU). Cache the SAME shape we return so cache
    // hits deliver identical data (previously the cache stored just `report`
    // without photoUrls, breaking Full Audit cache hits).
    if (!body.isDemo && listingUrl) {
      setCachedReport(listingUrl, plan, fullReport)
    }

    // Cache report in Supabase for email re-access (awaited so cache is ready
    // before response — prevents race where email re-access finds empty cache)
    if (body.sessionId && !body.isDemo) {
      try {
        await cacheReport(body.sessionId, plan, listingUrl, fullReport)
      } catch (err) {
        console.warn('[analyze] Failed to cache report:', err)
      }
    }

    // Report delivered successfully — capture the authorized payment.
    await capturePaymentIntent(paymentIntentId, alreadyCaptured)
    settled = true

    // Server-side email for Quick Score (no photo step follows).
    // Full Audit email is sent from analyze-photos after photos are cached.
    // Dedup prevents double-send if client also triggers the email.
    if (body.sessionId && !isDemo && !body.reaccess && plan === 'quick-score') {
      triggerReportEmail(body.sessionId).catch(err =>
        console.warn('[analyze] Failed to trigger report email:', err)
      )
    }

    logAnalyticsEvent({ route: 'analyze', plan, success: true, duration_ms: Date.now() - startTime, is_demo: isDemo, is_reaccess: !!body.reaccess })
    return NextResponse.json(fullReport)
  } catch (err) {
    console.error('[analyze] Error:', err)
    logAnalyticsEvent({ route: 'analyze', success: false, duration_ms: Date.now() - startTime, error: err instanceof Error ? err.message : 'Unknown error' })
    return NextResponse.json({ error: 'Analysis failed. Check your API key and try again.' }, { status: 500 })
  } finally {
    // Safety net: if we exit the handler without an explicit capture/cancel,
    // release the authorization so the customer's card hold is dropped
    // immediately. Covers the inner Claude API catch (502), validation/JSON
    // throws caught by the outer catch (500), and any future return path
    // that forgets to settle. No-op when paymentIntentId is undefined
    // (demo / mock / dev / payment-verify-early-exit).
    if (!settled) {
      await cancelPaymentIntent(paymentIntentId, alreadyCaptured)
    }
  }
}
