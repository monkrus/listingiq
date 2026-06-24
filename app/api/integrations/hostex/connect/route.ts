import { NextRequest, NextResponse } from 'next/server'
import { saveHostexToken } from '@/app/lib/supabase'
import { fetchHostexListingInputs } from '@/app/lib/integrations/hostex-adapter'

/**
 * POST /api/integrations/hostex/connect
 * Body: { accessToken: "xxx" }
 *
 * Validates the token by fetching listings, then stores it in Supabase.
 * Returns a connection_id for future API calls.
 */
export async function POST(req: NextRequest) {
  const { accessToken } = await req.json()

  if (!accessToken || typeof accessToken !== 'string') {
    return NextResponse.json({ error: 'Missing access token' }, { status: 400 })
  }

  // Validate the token by attempting a fetch
  try {
    await fetchHostexListingInputs({ accessToken })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    if (msg.includes('401') || msg.includes('403')) {
      return NextResponse.json({ error: 'Invalid API token. Please check and try again.' }, { status: 401 })
    }
    return NextResponse.json({ error: `Could not connect to Hostex: ${msg}` }, { status: 502 })
  }

  const connectionId = await saveHostexToken(accessToken)
  if (!connectionId) {
    return NextResponse.json({ error: 'Failed to save connection. Please try again.' }, { status: 500 })
  }

  return NextResponse.json({ connectionId })
}
