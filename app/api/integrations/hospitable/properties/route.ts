import { NextRequest, NextResponse } from 'next/server'
import { fetchHospitableListingInputs, resolveToken } from '@/app/lib/integrations/hospitable-adapter'

/**
 * GET /api/integrations/hospitable/properties?connectionId=xxx
 *
 * Returns a list of Hospitable properties with basic info for the property picker.
 */
export async function GET(req: NextRequest) {
  const connectionId = req.nextUrl.searchParams.get('connectionId')
  if (!connectionId) {
    return NextResponse.json({ error: 'Missing connectionId' }, { status: 400 })
  }

  let token: string
  try {
    token = await resolveToken(connectionId)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Connection error'
    return NextResponse.json({ error: msg }, { status: 401 })
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
