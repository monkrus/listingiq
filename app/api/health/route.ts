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

  // Check required env vars are present (not their values)
  checks.anthropic = process.env.ANTHROPIC_API_KEY ? 'configured' : 'missing'
  checks.stripe = process.env.STRIPE_SECRET_KEY ? 'configured' : 'missing'

  const healthy = checks.status === 'ok' && checks.anthropic === 'configured' && checks.stripe === 'configured'

  return NextResponse.json(checks, { status: healthy ? 200 : 503 })
}
