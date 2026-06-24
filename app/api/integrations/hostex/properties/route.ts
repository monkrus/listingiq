import { NextRequest, NextResponse } from 'next/server'
import { getHostexConnection } from '@/app/lib/supabase'
import { fetchHostexListingInputs } from '@/app/lib/integrations/hostex-adapter'

/**
 * GET /api/integrations/hostex/properties?connectionId=xxx
 *
 * Returns a list of Hostex listings with basic info for the property picker.
 */
export async function GET(req: NextRequest) {
  const connectionId = req.nextUrl.searchParams.get('connectionId')
  if (!connectionId) {
    return NextResponse.json({ error: 'Missing connectionId' }, { status: 400 })
  }

  const accessToken = await getHostexConnection(connectionId)
  if (!accessToken) {
    return NextResponse.json({ error: 'Connection not found. Please reconnect.' }, { status: 401 })
  }

  try {
    const items = await fetchHostexListingInputs({ accessToken })

    const properties = items.map(({ input, readiness, raw }) => ({
      id: raw.listing_id ?? raw.id,
      title: input.title || raw.metadata?.name || 'Untitled Listing',
      location: input.location,
      photoUrl: input.photoUrls?.[0] || null,
      photoCount: input.photoCount || 0,
      amenityCount: input.amenities?.length || 0,
      readiness: readiness.mode,
      missing: readiness.missing,
    }))

    return NextResponse.json({ properties })
  } catch (err) {
    console.error('[hostex] Failed to fetch listings:', err)
    const msg = err instanceof Error ? err.message : 'Unknown error'
    if (msg.includes('401') || msg.includes('403')) {
      return NextResponse.json({ error: 'Hostex token expired or invalid. Please reconnect.' }, { status: 401 })
    }
    return NextResponse.json({ error: msg }, { status: 502 })
  }
}
