import { NextRequest, NextResponse } from 'next/server'
import { getHostexConnection } from '@/app/lib/supabase'
import { fetchHostexListingInputs } from '@/app/lib/integrations/hostex-adapter'

/**
 * GET /api/integrations/hostex/properties
 *
 * Returns a list of Hostex listings with basic info for the property picker.
 * Reads connectionId from httpOnly cookie.
 */
export async function GET(req: NextRequest) {
  const connectionId = req.cookies.get('hostex_connection_id')?.value
  if (!connectionId) {
    return NextResponse.json({ error: 'Not connected. Please connect your Hostex account.' }, { status: 401 })
  }

  const accessToken = await getHostexConnection(connectionId)
  if (!accessToken) {
    const response = NextResponse.json({ error: 'Connection not found. Please reconnect.' }, { status: 401 })
    response.cookies.delete('hostex_connection_id')
    return response
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

    return NextResponse.json({ properties: properties.slice(0, 100), total: properties.length })
  } catch (err) {
    console.error('[hostex] Failed to fetch listings:', err)
    const msg = err instanceof Error ? err.message : 'Unknown error'
    if (msg.includes('401') || msg.includes('403')) {
      return NextResponse.json({ error: 'Hostex token expired or invalid. Please reconnect.' }, { status: 401 })
    }
    return NextResponse.json({ error: msg }, { status: 502 })
  }
}
