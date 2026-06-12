import { NextRequest, NextResponse } from 'next/server'
import { checkOrigin } from '@/app/lib/check-origin'
import { rateLimit } from '@/app/lib/rate-limit'
import { triggerReportEmail } from '@/app/lib/trigger-report-email'

export async function POST(req: NextRequest) {
  const originBlock = checkOrigin(req)
  if (originBlock) return originBlock

  // Rate limit: 6 email sends per minute per IP
  // (server-side triggers from analyze + analyze-photos + client-side sendReportEmail
  //  can stack up quickly, especially for Full Audit)
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  const { limited } = rateLimit(ip, 6, 60_000)
  if (limited) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
  }

  const { sessionId } = await req.json()
  if (!sessionId) {
    return NextResponse.json({ error: 'Missing sessionId' }, { status: 400 })
  }

  try {
    const result = await triggerReportEmail(sessionId)
    if (!result.sent && result.reason === 'not_paid') {
      return NextResponse.json({ sent: false, reason: result.reason }, { status: 403 })
    }
    return NextResponse.json(result)
  } catch (err) {
    console.error('[send-report-email] Error:', err)
    return NextResponse.json({ error: 'Failed to send email' }, { status: 500 })
  }
}
