import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { logger } from '@/app/lib/logger'
import { getSupabaseAdmin } from '@/app/lib/supabase'

/**
 * POST /api/integrations/hostex/webhook
 *
 * Receives webhook events from Hostex when listings are updated.
 * Events: listing.updated, listing.created, listing.deleted
 *
 * Security:
 * - Validates HMAC SHA-256 signature via x-hostex-signature header
 * - Uses crypto.timingSafeEqual to prevent timing attacks
 * - Fails closed: returns 503 if HOSTEX_WEBHOOK_SECRET is unset
 */
export async function POST(req: NextRequest) {
  const webhookSecret = process.env.HOSTEX_WEBHOOK_SECRET

  // Fail closed: if no webhook secret is configured, refuse all webhooks
  if (!webhookSecret) {
    logger.error('hostex', 'webhook_secret_missing', {
      message: 'HOSTEX_WEBHOOK_SECRET is not set. Refusing unsigned webhooks.',
    })
    return NextResponse.json(
      { error: 'Webhook verification not configured' },
      { status: 503 }
    )
  }

  const signature = req.headers.get('x-hostex-signature')
  const body = await req.text()

  if (!signature) {
    logger.warn('hostex', 'webhook_no_signature')
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
    logger.warn('hostex', 'webhook_invalid_signature')
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  let payload: any
  try {
    payload = JSON.parse(body)
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const event = payload.event || payload.type
  const listingId = payload.data?.listing_id || payload.listing_id

  logger.info('hostex', 'webhook_received', { event, listingId })

  switch (event) {
    case 'listing.updated':
    case 'listing.created': {
      const db = getSupabaseAdmin()
      if (db) {
        await db.from('pms_webhooks').insert({
          platform: 'hostex',
          event,
          property_id: listingId,
          payload,
        }).then(({ error }) => {
          if (error) logger.error('hostex', 'webhook_store_failed', { error: error.message })
        })
      }
      break
    }

    case 'listing.deleted': {
      logger.info('hostex', 'listing_deleted', { listingId })
      break
    }

    default:
      logger.info('hostex', 'webhook_unhandled_event', { event })
  }

  return NextResponse.json({ received: true })
}
