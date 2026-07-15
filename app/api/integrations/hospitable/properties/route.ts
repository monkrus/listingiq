import { NextRequest, NextResponse } from 'next/server'
import { fetchHospitableListingInputs, resolveToken } from '@/app/lib/integrations/hospitable-adapter'

/**
 * GET /api/integrations/hospitable/properties
 *
 * Returns a list of Hospitable properties with basic info for the property picker.
 * Reads connectionId from httpOnly cookie (set during OAuth callback).
 */
export async function GET(req: NextRequest) {
  const connectionId = req.cookies.get('hospitable_connection_id')?.value
  if (!connectionId) {
    return NextResponse.json({ error: 'Not connected. Please connect your Hospitable account.' }, { status: 401 })
  }

  let token: string
  try {
    token = await resolveToken(connectionId)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Connection error'
    // Clear stale cookie on auth failure
    const response = NextResponse.json({ error: msg }, { status: 401 })
    response.cookies.delete('hospitable_connection_id')
    return response
  }

  try {
    const items = await fetchHospitableListingInputs({
      token,
      includeReviews: false,
    })

    const properties = items.map(({ input, readiness, raw }) => ({
      id: raw.id,
      title: input.title || raw.name || 'Untitled Property',
      location: input.location,
      photoUrl: input.photoUrls?.[0] || null,
      photoCount: input.photoCount || 0,
      amenityCount: input.amenities?.length || 0,
      readiness: readiness.mode,
      missing: readiness.missing,
    }))

    return NextResponse.json({ properties })
  } catch (err) {
    console.error('[hospitable] Failed to fetch properties:', err)
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 502 })
  }
}
