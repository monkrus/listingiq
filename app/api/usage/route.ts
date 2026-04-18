import { NextRequest, NextResponse } from 'next/server'
import { getProfile, getReportsThisMonth, getPlanLimit } from '@/app/lib/supabase'
import { checkOrigin } from '@/app/lib/check-origin'
import { rateLimit } from '@/app/lib/rate-limit'

export async function GET(req: NextRequest) {
  const originBlock = checkOrigin(req)
  if (originBlock) return originBlock

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  const { limited } = rateLimit(ip, 10, 60_000)
  if (limited) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
  }

  const userId = req.nextUrl.searchParams.get('userId')
  if (!userId) return NextResponse.json({ canAnalyze: false, reason: 'Not authenticated' })

  const profile = await getProfile(userId)
  if (!profile) return NextResponse.json({ canAnalyze: false, reason: 'Profile not found' })

  // Check pay-per-report credits
  if (profile.credits > 0) {
    return NextResponse.json({ canAnalyze: true, plan: profile.plan, credits: profile.credits })
  }

  const limit = getPlanLimit(profile.plan)
  if (limit === -1) return NextResponse.json({ canAnalyze: true, plan: profile.plan })
  if (limit === 0) {
    return NextResponse.json({ canAnalyze: false, reason: `No access on ${profile.plan} plan`, plan: profile.plan })
  }

  const used = await getReportsThisMonth(userId)
  if (used < limit) {
    return NextResponse.json({ canAnalyze: true, plan: profile.plan, used, limit })
  }

  return NextResponse.json({
    canAnalyze: false,
    reason: `Monthly limit reached (${limit} report${limit !== 1 ? 's' : ''} on ${profile.plan} plan)`,
    plan: profile.plan,
    used,
    limit,
  })
}
