import { NextRequest, NextResponse } from 'next/server'
import { resolveToken } from '@/app/lib/integrations/hospitable-adapter'
import { rateLimit } from '@/app/lib/rate-limit'
import { logger } from '@/app/lib/logger'

const BASE_URL = 'https://public.api.hospitable.com/v2'

/**
 * POST /api/integrations/hospitable/apply
 * Body: { connectionId, propertyId, title?, description?, photoOrder?: string[] }
 *
 * Pushes optimized title/description/photo order back to Hospitable.
 * Only writes fields that are provided.
 */
export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  const { limited } = rateLimit(ip, 5, 60_000)
  if (limited) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
  }

  const { connectionId, propertyId, title, description, photoOrder } = await req.json()

  if (!connectionId || !propertyId) {
    return NextResponse.json({ error: 'Missing connectionId or propertyId' }, { status: 400 })
  }

  if (!title && !description && !photoOrder) {
    return NextResponse.json({ error: 'Nothing to update — provide title, description, or photoOrder' }, { status: 400 })
  }

  let token: string
  try {
    token = await resolveToken(connectionId)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Connection error'
    return NextResponse.json({ error: msg }, { status: 401 })
  }

  // Build the update payload — only include fields that were provided
  const updateBody: Record<string, unknown> = {}
  if (title) updateBody.public_name = title
  if (description) updateBody.description = description
  if (Array.isArray(photoOrder) && photoOrder.length > 0) updateBody.photos = photoOrder

  try {
    const res = await fetch(`${BASE_URL}/properties/${propertyId}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(updateBody),
    })

    if (!res.ok) {
      const body = await res.text()
      logger.error('hospitable', 'apply_failed', { propertyId, status: res.status, body })

      if (res.status === 403) {
        return NextResponse.json({
          error: 'Write access denied. Your Hospitable connection may need additional permissions (properties:write scope).',
        }, { status: 403 })
      }

      return NextResponse.json({
        error: `Failed to update property: ${res.status}`,
      }, { status: 502 })
    }

    logger.info('hospitable', 'apply_success', { propertyId, fields: Object.keys(updateBody) })

    return NextResponse.json({
      success: true,
      updated: Object.keys(updateBody),
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    logger.error('hospitable', 'apply_error', { propertyId, error: msg })
    return NextResponse.json({ error: `Failed to update property: ${msg}` }, { status: 502 })
  }
}
