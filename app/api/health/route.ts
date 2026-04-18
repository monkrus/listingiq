import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/app/lib/supabase'

export async function GET() {
  const checks: Record<string, string> = {
    status: 'ok',
    version: process.env.NEXT_PUBLIC_APP_VERSION || 'unknown',
  }

  // Verify Supabase is reachable
  const db = getSupabaseAdmin()
  if (db) {
    try {
      const { error } = await db.from('cached_reports').select('session_id').limit(1)
      checks.supabase = error ? 'error' : 'ok'
    } catch {
      checks.supabase = 'error'
    }
  } else {
    checks.supabase = 'not_configured'
  }

  // Check required env vars internally — don't expose config state to public
  const anthropicOk = !!process.env.ANTHROPIC_API_KEY
  const stripeOk = !!process.env.STRIPE_SECRET_KEY
  if (!anthropicOk) console.warn('[health] ANTHROPIC_API_KEY not configured')
  if (!stripeOk) console.warn('[health] STRIPE_SECRET_KEY not configured')

  const healthy = checks.status === 'ok' && anthropicOk && stripeOk

  return NextResponse.json(checks, { status: healthy ? 200 : 503 })
}
