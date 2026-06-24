import { NextRequest, NextResponse } from 'next/server'
import { getHostexConnection } from '@/app/lib/supabase'
import { fetchHostexListingInputs } from '@/app/lib/integrations/hostex-adapter'
import { analyzeListingInput, AnalysisError } from '@/app/lib/analyze-core'

export async function POST(req: NextRequest) {
  const { connectionId, accessToken: rawToken, plan, listingId } = await req.json()

  // Support both connectionId (production) and raw token (testing)
  let accessToken: string
  if (connectionId) {
    const token = await getHostexConnection(connectionId)
    if (!token) {
      return NextResponse.json({ error: 'Connection not found. Please reconnect.' }, { status: 401 })
    }
    accessToken = token
  } else if (rawToken) {
    accessToken = rawToken
  } else {
    return NextResponse.json({ error: 'Missing connectionId or accessToken' }, { status: 400 })
  }

  const effectivePlan = plan || 'quick-score'

  let items
  try {
    items = await fetchHostexListingInputs({ accessToken, channelType: 'airbnb' })
  } catch (err) {
    console.error('[hostex] Failed to fetch listings:', err)
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: `Failed to fetch Hostex listings: ${msg}` }, { status: 502 })
  }

  // Optionally narrow to one listing
  const targets = listingId
    ? items.filter((i) => String(i.raw.listing_id ?? i.raw.id) === String(listingId))
    : items

  if (listingId && targets.length === 0) {
    return NextResponse.json({ error: `Listing ${listingId} not found in Hostex account` }, { status: 404 })
  }

  const results = []
  for (const { input, readiness, raw } of targets) {
    const id = raw.listing_id ?? raw.id

    if (readiness.mode === 'insufficient') {
      results.push({
        listingId: id,
        skipped: true,
        reason: `Not enough listing content to audit (missing: ${readiness.missing.join(', ')})`,
      })
      continue
    }

    try {
      const report = await analyzeListingInput(input, {
        sourceLabel: 'data imported from Hostex PMS',
      })
      results.push({
        listingId: id,
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
          listingId: id,
          skipped: true,
          reason: err.message,
        })
        continue
      }
      throw err
    }
  }

  return NextResponse.json({ source: 'hostex', count: results.length, results })
}
