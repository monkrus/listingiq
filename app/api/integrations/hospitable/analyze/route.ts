import { NextRequest, NextResponse } from 'next/server'
import { fetchHospitableListingInputs, resolveToken } from '@/app/lib/integrations/hospitable-adapter'
import { analyzeListingInput, AnalysisError } from '@/app/lib/analyze-core'

export async function POST(req: NextRequest) {
  const { connectionId, token: rawToken, plan, propertyId } = await req.json()

  // Support both connection_id (OAuth, production) and raw token (PAT, testing)
  let token: string
  if (connectionId) {
    try {
      token = await resolveToken(connectionId)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Connection error'
      return NextResponse.json({ error: msg }, { status: 401 })
    }
  } else if (rawToken) {
    token = rawToken
  } else {
    return NextResponse.json({ error: 'Missing connectionId or token' }, { status: 400 })
  }

  const effectivePlan = plan || 'quick-score'

  let items
  try {
    items = await fetchHospitableListingInputs({
      token,
      propertyId,
      includeReviews: true,
    })
  } catch (err) {
    console.error('[hospitable] Failed to fetch properties:', err)
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: `Failed to fetch Hospitable properties: ${msg}` }, { status: 502 })
  }

  if (propertyId && items.length === 0) {
    return NextResponse.json({ error: `Property ${propertyId} not found in Hospitable account` }, { status: 404 })
  }

  const results = []
  for (const { input, readiness, raw } of items) {
    const id = raw.id

    if (readiness.mode === 'insufficient') {
      results.push({
        propertyId: id,
        skipped: true,
        reason: `Not enough listing content to audit (missing: ${readiness.missing.join(', ')})`,
      })
      continue
    }

    try {
      const report = await analyzeListingInput(input, {
        sourceLabel: 'data imported from Hospitable PMS',
      })
      results.push({
        propertyId: id,
        readiness: readiness.mode,
        report,
        photoUrls: input.photoUrls,
        listing: {
          title: input.title,
          location: input.location,
          photoCount: input.photoCount,
          amenities: input.amenities?.slice(0, 5),
        },
      })
    } catch (err) {
      if (err instanceof AnalysisError) {
        results.push({
          propertyId: id,
          skipped: true,
          reason: err.message,
        })
        continue
      }
      throw err
    }
  }

  return NextResponse.json({ source: 'hospitable', count: results.length, results })
}
