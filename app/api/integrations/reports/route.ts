import { NextRequest, NextResponse } from 'next/server'
import { getPmsReports, getPmsReport, getPmsReportBySession } from '@/app/lib/pms-reports'
import { rateLimit } from '@/app/lib/rate-limit'

/**
 * GET /api/integrations/reports?connectionId=xxx&platform=hospitable
 * GET /api/integrations/reports?reportId=xxx
 *
 * Retrieve saved PMS reports for a connection or a single report by ID.
 */
export async function GET(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  const { limited } = rateLimit(ip, 20, 60_000)
  if (limited) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
  }

  const reportId = req.nextUrl.searchParams.get('reportId')
  if (reportId) {
    const report = await getPmsReport(reportId)
    if (!report) {
      return NextResponse.json({ error: 'Report not found' }, { status: 404 })
    }
    return NextResponse.json({ report })
  }

  // Lookup by Stripe session ID (email re-access)
  const sessionId = req.nextUrl.searchParams.get('sessionId')
  if (sessionId) {
    const report = await getPmsReportBySession(sessionId)
    if (!report) {
      return NextResponse.json({ error: 'Report not found' }, { status: 404 })
    }
    return NextResponse.json({ report })
  }

  const platform = req.nextUrl.searchParams.get('platform') || undefined
  const connectionId = platform === 'hospitable'
    ? req.cookies.get('hospitable_connection_id')?.value
    : platform === 'hostex'
      ? req.cookies.get('hostex_connection_id')?.value
      : undefined

  if (!connectionId) {
    return NextResponse.json({ error: 'Not connected' }, { status: 401 })
  }

  const reports = await getPmsReports(connectionId, platform)

  return NextResponse.json({ reports })
}
