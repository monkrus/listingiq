import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/app/lib/supabase'
import { rateLimit } from '@/app/lib/rate-limit'

/**
 * GET /api/integrations/notifications?connectionId=xxx&platform=hospitable
 *
 * Returns property IDs that have unprocessed webhook events
 * (i.e., properties that changed since last analysis).
 */
export async function GET(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  const { limited } = rateLimit(ip, 20, 60_000)
  if (limited) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
  }

  const platform = req.nextUrl.searchParams.get('platform')
  if (!platform || !['hospitable', 'hostex'].includes(platform)) {
    return NextResponse.json({ error: 'Invalid platform' }, { status: 400 })
  }

  const db = getSupabaseAdmin()
  if (!db) {
    return NextResponse.json({ updatedProperties: [] })
  }

  const { data, error } = await db
    .from('pms_webhooks')
    .select('property_id, event, created_at')
    .eq('platform', platform)
    .eq('processed', false)
    .order('created_at', { ascending: false })
    .limit(100)

  if (error) {
    return NextResponse.json({ updatedProperties: [] })
  }

  // Deduplicate by property_id — return unique list
  const seen = new Set<string>()
  const updatedProperties = (data || [])
    .filter(d => {
      if (!d.property_id || seen.has(d.property_id)) return false
      seen.add(d.property_id)
      return true
    })
    .map(d => ({
      propertyId: d.property_id,
      event: d.event,
      updatedAt: d.created_at,
    }))

  return NextResponse.json({ updatedProperties })
}

/**
 * POST /api/integrations/notifications
 * Body: { platform, propertyId }
 *
 * Mark webhook events for a property as processed (after re-analysis).
 */
export async function POST(req: NextRequest) {
  const { platform, propertyId } = await req.json()

  if (!platform || !propertyId) {
    return NextResponse.json({ error: 'Missing platform or propertyId' }, { status: 400 })
  }

  const db = getSupabaseAdmin()
  if (!db) {
    return NextResponse.json({ marked: 0 })
  }

  const { data, error } = await db
    .from('pms_webhooks')
    .update({ processed: true })
    .eq('platform', platform)
    .eq('property_id', propertyId)
    .eq('processed', false)
    .select('id')

  if (error) {
    return NextResponse.json({ error: 'Failed to mark as processed' }, { status: 500 })
  }

  return NextResponse.json({ marked: data?.length || 0 })
}
