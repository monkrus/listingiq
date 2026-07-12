import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/app/lib/supabase'
import { rateLimit } from '@/app/lib/rate-limit'

/**
 * POST /api/integrations/save-email
 * Body: { email, platform, connectionId }
 *
 * Lightweight auth: associates an email with a PMS connection
 * so users can recover their reports from any device.
 */
export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  const { limited } = rateLimit(ip, 10, 60_000)
  if (limited) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
  }

  const { email, platform, connectionId } = await req.json()

  if (!email || !platform || !connectionId) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  if (!['hospitable', 'hostex'].includes(platform)) {
    return NextResponse.json({ error: 'Invalid platform' }, { status: 400 })
  }

  // Basic email validation
  if (!email.includes('@') || email.length < 5) {
    return NextResponse.json({ error: 'Invalid email address' }, { status: 400 })
  }

  const db = getSupabaseAdmin()
  if (!db) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 500 })
  }

  const { error } = await db
    .from('pms_user_emails')
    .upsert(
      { email, platform, connection_id: connectionId },
      { onConflict: 'email,platform,connection_id' }
    )

  if (error) {
    console.error('[save-email]', error)
    return NextResponse.json({ error: 'Failed to save email' }, { status: 500 })
  }

  return NextResponse.json({ saved: true })
}

/**
 * GET /api/integrations/save-email?email=xxx&platform=hospitable
 *
 * Recover connections by email — returns connection IDs.
 */
export async function GET(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  const { limited } = rateLimit(ip, 10, 60_000)
  if (limited) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
  }

  const email = req.nextUrl.searchParams.get('email')
  const platform = req.nextUrl.searchParams.get('platform')

  if (!email) {
    return NextResponse.json({ error: 'Missing email' }, { status: 400 })
  }

  const db = getSupabaseAdmin()
  if (!db) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 500 })
  }

  let query = db
    .from('pms_user_emails')
    .select('connection_id, platform, created_at')
    .eq('email', email)
    .order('created_at', { ascending: false })

  if (platform) {
    query = query.eq('platform', platform)
  }

  const { data, error } = await query

  if (error) {
    return NextResponse.json({ error: 'Failed to look up email' }, { status: 500 })
  }

  return NextResponse.json({ connections: data || [] })
}
