import { NextRequest, NextResponse } from 'next/server'
import { rateLimit } from '@/app/lib/rate-limit'
import { getPmsReport } from '@/app/lib/pms-reports'
import { sendReceiptEmail } from '@/app/lib/email'

/**
 * POST /api/integrations/send-email
 * Body: { reportId, email }
 *
 * Sends a PMS report to the user's email address.
 */
export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  const { limited } = rateLimit(ip, 5, 60_000)
  if (limited) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
  }

  const { reportId, email } = await req.json()

  if (!reportId || !email) {
    return NextResponse.json({ error: 'Missing reportId or email' }, { status: 400 })
  }

  if (!email.includes('@') || email.length < 5) {
    return NextResponse.json({ error: 'Invalid email' }, { status: 400 })
  }

  const report = await getPmsReport(reportId)
  if (!report) {
    return NextResponse.json({ error: 'Report not found' }, { status: 404 })
  }

  try {
    await sendReceiptEmail({
      to: email,
      plan: report.plan,
      sessionId: report.session_id || reportId,
      reportData: report.report_data,
      platform: report.platform,
    })

    return NextResponse.json({ sent: true })
  } catch (err) {
    console.error('[pms-send-email]', err)
    return NextResponse.json({ error: 'Failed to send email' }, { status: 500 })
  }
}
