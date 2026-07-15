import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { logger } from '@/app/lib/logger'
import { getSupabaseAdmin } from '@/app/lib/supabase'

/**
 * POST /api/integrations/hospitable/webhook
 *
 * Receives webhook events from Hospitable when properties are updated.
 * Events: property.updated, property.created, property.deleted
 *
 * Security:
 * - Validates HMAC SHA-256 signature via x-hospitable-signature header
 * - Uses crypto.timingSafeEqual to prevent timing attacks
 * - Fails closed: returns 503 if HOSPITABLE_WEBHOOK_SECRET is unset
 */
export async function POST(req: NextRequest) {
  const webhookSecret = process.env.HOSPITABLE_WEBHOOK_SECRET

  // Fail closed: if no webhook secret is configured, refuse all webhooks
  if (!webhookSecret) {
    logger.error('hospitable', 'webhook_secret_missing', {
      message: 'HOSPITABLE_WEBHOOK_SECRET is not set. Refusing unsigned webhooks.',
    })
    return NextResponse.json(
      { error: 'Webhook verification not configured' },
      { status: 503 }
    )
  }

  const signature = req.headers.get('x-hospitable-signature')
  const body = await req.text()

  if (!signature) {
    logger.warn('hospitable', 'webhook_no_signature')
    return NextResponse.json({ error: 'Missing signature' }, { status: 401 })
  }

  // Compute expected HMAC SHA-256
  const expected = crypto
    .createHmac('sha256', webhookSecret)
    .update(body)
    .digest('hex')

  // Accept both raw hex and "sha256=hex" formats
  const providedHex = signature.startsWith('sha256=')
    ? signature.slice(7)
    : signature

  // Timing-safe comparison
  const expectedBuf = Buffer.from(expected, 'hex')
  const providedBuf = Buffer.from(providedHex, 'hex')

  if (expectedBuf.length !== providedBuf.length || !crypto.timingSafeEqual(expectedBuf, providedBuf)) {
    logger.warn('hospitable', 'webhook_invalid_signature')
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  let payload: any
  try {
    payload = JSON.parse(body)
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const event = payload.event || payload.type
  const propertyId = payload.data?.id || payload.property_id

  logger.info('hospitable', 'webhook_received', { event, propertyId })

  switch (event) {
    case 'property.updated':
    case 'property.created': {
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
