import { NextRequest, NextResponse } from 'next/server'
import { fetchHospitableListingInputs } from '@/app/lib/integrations/hospitable-adapter'
import { analyzeListingInput, AnalysisError } from '@/app/lib/analyze-core'

export async function POST(req: NextRequest) {
  const { token, plan, propertyId } = await req.json()

  if (!token) {
    return NextResponse.json({ error: 'Missing Hospitable access token' }, { status: 400 })
  }

  const effectivePlan = plan || 'quick-score'

  let items
  try {
    items = await fetchHospitableListingInputs({ token, propertyId })
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
