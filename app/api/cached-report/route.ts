import { NextRequest, NextResponse } from 'next/server'
import { getCachedReportBySession } from '@/app/lib/supabase'

export async function GET(req: NextRequest) {
  const sessionId = req.nextUrl.searchParams.get('session_id')
  if (!sessionId) {
    return NextResponse.json({ found: false }, { status: 400 })
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
