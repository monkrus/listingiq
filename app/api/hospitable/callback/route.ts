import { NextRequest, NextResponse } from 'next/server'

/**
 * Hospitable OAuth callback handler.
 *
 * Flow:
 * 1. User visits /api/hospitable/authorize → redirected to Hospitable login
 * 2. After granting access, Hospitable redirects here with ?code=XXX
 * 3. We exchange the code for an access_token + refresh_token
 * 4. Display the token (for testing) or store it (for production)
 */

const TOKEN_URL = 'https://auth.hospitable.com/oauth/token'
const CLIENT_ID = process.env.HOSPITABLE_CLIENT_ID!
const CLIENT_SECRET = process.env.HOSPITABLE_CLIENT_SECRET!
const REDIRECT_URI = process.env.HOSPITABLE_REDIRECT_URI || 'https://listingiq.pro/api/hospitable/callback'

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code')
  const error = req.nextUrl.searchParams.get('error')

  if (error) {
    const desc = req.nextUrl.searchParams.get('error_description') || error
    return NextResponse.json({ error: 'Authorization denied', detail: desc }, { status: 400 })
  }

  if (!code) {
    return NextResponse.json({ error: 'Missing authorization code' }, { status: 400 })
  }

  // Exchange code for tokens
  const tokenRes = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      redirect_uri: REDIRECT_URI,
      code,
    }),
  })

  if (!tokenRes.ok) {
    const body = await tokenRes.text()
    console.error('[hospitable] Token exchange failed:', tokenRes.status, body)
    return NextResponse.json(
      { error: 'Token exchange failed', status: tokenRes.status, detail: body },
      { status: 502 }
    )
  }

  const tokens = await tokenRes.json()

  // For now, return the tokens so you can test the adapter.
  // In production, store these securely (e.g., in Supabase) per user.
  return NextResponse.json({
    message: 'Hospitable connected successfully!',
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expires_in: tokens.expires_in,
    token_type: tokens.token_type,
  })
}
