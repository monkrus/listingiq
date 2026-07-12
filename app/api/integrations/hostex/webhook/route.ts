import { NextRequest, NextResponse } from 'next/server'
import { logger } from '@/app/lib/logger'
import { getSupabaseAdmin } from '@/app/lib/supabase'

/**
 * POST /api/integrations/hostex/webhook
 *
 * Receives webhook events from Hostex when listings are updated.
 * Events: listing.updated, listing.created, listing.deleted
 *
 * Setup: Configure this URL in Hostex's webhook settings.
 * Security: Validates the X-Hostex-Signature header.
 */
export async function POST(req: NextRequest) {
  const signature = req.headers.get('x-hostex-signature')
  const webhookSecret = process.env.HOSTEX_WEBHOOK_SECRET

  // Verify signature if secret is configured
  if (webhookSecret && webhookSecret !== 'not-configured') {
    if (!signature) {
      logger.warn('hostex', 'webhook_no_signature')
      return NextResponse.json({ error: 'Missing signature' }, { status: 401 })
    }

    const crypto = await import('crypto')
    const body = await req.clone().text()
    const expected = crypto
      .createHmac('sha256', webhookSecret)
      .update(body)
      .digest('hex')

    if (signature !== expected && signature !== `sha256=${expected}`) {
      logger.warn('hostex', 'webhook_invalid_signature')
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
