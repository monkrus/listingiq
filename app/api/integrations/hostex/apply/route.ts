import { NextRequest, NextResponse } from 'next/server'
import { getHostexConnection } from '@/app/lib/supabase'
import { rateLimit } from '@/app/lib/rate-limit'
import { logger } from '@/app/lib/logger'

const HOSTEX_BASE = 'https://api.hostex.io/v3'

/**
 * POST /api/integrations/hostex/apply
 * Body: { connectionId, listingId, title?, description? }
 *
 * Pushes optimized title/description back to Hostex.
 * Only writes fields that are provided.
 */
export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  const { limited } = rateLimit(ip, 5, 60_000)
  if (limited) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
  }

  const { connectionId, listingId, title, description, photoOrder } = await req.json()

  if (!connectionId || !listingId) {
    return NextResponse.json({ error: 'Missing connectionId or listingId' }, { status: 400 })
  }

  if (!title && !description && !photoOrder) {
    return NextResponse.json({ error: 'Nothing to update — provide title, description, or photoOrder' }, { status: 400 })
  }

  const accessToken = await getHostexConnection(connectionId)
  if (!accessToken) {
    return NextResponse.json({ error: 'Connection not found. Please reconnect.' }, { status: 401 })
  }

  // Build the update payload
  const updateBody: Record<string, unknown> = {}
  if (title) updateBody.title = title
  if (description) updateBody.description = description
  if (Array.isArray(photoOrder) && photoOrder.length > 0) updateBody.photos = photoOrder

  try {
    const res = await fetch(`${HOSTEX_BASE}/listings/${listingId}`, {
      method: 'PATCH',
      headers: {
        'Hostex-Access-Token': accessToken,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(updateBody),
    })

    if (!res.ok) {
      const body = await res.text()
      logger.error('hostex', 'apply_failed', { listingId, status: res.status, body })

      if (res.status === 403) {
        return NextResponse.json({
          error: 'Write access denied. Your Hostex API token may not have write permissions.',
        }, { status: 403 })
      }

      return NextResponse.json({
        error: `Failed to update listing: ${res.status}`,
      }, { status: 502 })
    }

    logger.info('hostex', 'apply_success', { listingId, fields: Object.keys(updateBody) })

    return NextResponse.json({
      success: true,
      updated: Object.keys(updateBody),
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    logger.error('hostex', 'apply_error', { listingId, error: msg })
    return NextResponse.json({ error: `Failed to update listing: ${msg}` }, { status: 502 })
  }
}
