import { NextRequest, NextResponse } from 'next/server'
import { getCachedReportBySession } from '@/app/lib/supabase'
import { verifyPayment } from '@/app/lib/verify-payment'
import { checkOrigin } from '@/app/lib/check-origin'
import { rateLimit } from '@/app/lib/rate-limit'

export async function GET(req: NextRequest) {
  // Origin check — reject requests from external sites
  const originBlock = checkOrigin(req)
  if (originBlock) return originBlock

  // Rate limit: 10 requests per minute per IP
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  const { limited } = rateLimit(ip, 10, 60_000)
  if (limited) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
  }

  const sessionId = req.nextUrl.searchParams.get('session_id')
  if (!sessionId) {
    return NextResponse.json({ found: false }, { status: 400 })
  }

  // Verify this session was actually paid
  const isDev = process.env.NODE_ENV === 'development'
  const isMock = process.env.USE_MOCK_API === 'true'
  if (!isDev && !isMock) {
    const payment = await verifyPayment(sessionId)
    if (!payment.valid) {
      return NextResponse.json({ found: false }, { status: 403 })
    }
  }

  const cached = await getCachedReportBySession(sessionId)
  if (!cached) {
    return NextResponse.json({ found: false })
  }

  return NextResponse.json({
    found: true,
    plan: cached.plan,
    listingUrl: cached.listingUrl,
    reportData: cached.reportData,
    photoResults: cached.photoResults,
    photoPreviews: cached.photoPreviews,
  })
}
