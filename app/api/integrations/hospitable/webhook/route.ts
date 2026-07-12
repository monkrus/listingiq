import { NextRequest, NextResponse } from 'next/server'
import { logger } from '@/app/lib/logger'
import { getSupabaseAdmin } from '@/app/lib/supabase'

/**
 * POST /api/integrations/hospitable/webhook
 *
 * Receives webhook events from Hospitable when properties are updated.
 * Events: property.updated, property.created, property.deleted
 *
 * Setup: Configure this URL in Hospitable's webhook settings.
 * Security: Validates the X-Hospitable-Signature header.
 */
export async function POST(req: NextRequest) {
  const signature = req.headers.get('x-hospitable-signature')
  const webhookSecret = process.env.HOSPITABLE_WEBHOOK_SECRET

  // Verify signature if secret is configured
  if (webhookSecret && webhookSecret !== 'not-configured') {
    if (!signature) {
      logger.warn('hospitable', 'webhook_no_signature')
      return NextResponse.json({ error: 'Missing signature' }, { status: 401 })
    }

    // HMAC verification — Hospitable uses SHA-256
    const crypto = await import('crypto')
    const body = await req.clone().text()
    const expected = crypto
      .createHmac('sha256', webhookSecret)
      .update(body)
      .digest('hex')

    if (signature !== expected && signature !== `sha256=${expected}`) {
      logger.warn('hospitable', 'webhook_invalid_signature')
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
    }
  }

  let payload: any
  try {
    payload = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const event = payload.event || payload.type
  const propertyId = payload.data?.id || payload.property_id

  logger.info('hospitable', 'webhook_received', { event, propertyId })

  switch (event) {
    case 'property.updated':
    case 'property.created': {
      // Store a notification that this property has new data available
      const db = getSupabaseAdmin()
      if (db) {
        await db.from('pms_webhooks').insert({
          platform: 'hospitable',
          event,
          property_id: propertyId,
          payload,
        }).then(({ error }) => {
          if (error) logger.error('hospitable', 'webhook_store_failed', { error: error.message })
        })
      }
      break
    }

    case 'property.deleted': {
      logger.info('hospitable', 'property_deleted', { propertyId })
      break
    }

    default:
      logger.info('hospitable', 'webhook_unhandled_event', { event })
  }

  return NextResponse.json({ received: true })
}
