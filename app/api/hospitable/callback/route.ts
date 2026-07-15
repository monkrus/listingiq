import { NextRequest, NextResponse } from 'next/server'
import { saveHospitableTokens } from '@/app/lib/supabase'

/**
 * Hospitable OAuth callback handler.
 *
 * Flow:
 * 1. User visits /api/hospitable/authorize -> redirected to Hospitable login
 * 2. After granting access, Hospitable redirects here with ?code=XXX&state=YYY
 * 3. Validate state against httpOnly cookie (CSRF protection)
 * 4. Exchange the code for an access_token + refresh_token
 * 5. Store tokens in Supabase, set connectionId in httpOnly cookie
 * 6. Redirect to /hospitable with a success flag (no sensitive data in URL)
 */

const TOKEN_URL = 'https://auth.hospitable.com/oauth/token'
const CLIENT_ID = process.env.HOSPITABLE_CLIENT_ID!
const CLIENT_SECRET = process.env.HOSPITABLE_CLIENT_SECRET!
const REDIRECT_URI = process.env.HOSPITABLE_REDIRECT_URI || 'https://listingiq.pro/api/hospitable/callback'
const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'https://listingiq.pro'

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code')
  const error = req.nextUrl.searchParams.get('error')
  const state = req.nextUrl.searchParams.get('state')

  if (error) {
    const desc = req.nextUrl.searchParams.get('error_description') || error
    const errorUrl = new URL('/hospitable', BASE_URL)
    errorUrl.searchParams.set('error', desc)
    return NextResponse.redirect(errorUrl)
  }

  // CSRF: validate state matches httpOnly cookie
  const savedState = req.cookies.get('hospitable_oauth_state')?.value
  if (!state || !savedState || state !== savedState) {
    const errorUrl = new URL('/hospitable', BASE_URL)
    errorUrl.searchParams.set('error', 'Invalid OAuth state. Please try connecting again.')
    const response = NextResponse.redirect(errorUrl)
    response.cookies.delete('hospitable_oauth_state')
    return response
  }

  if (!code) {
    const errorUrl = new URL('/hospitable', BASE_URL)
    errorUrl.searchParams.set('error', 'Missing authorization code')
    return NextResponse.redirect(errorUrl)
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
    const errorUrl = new URL('/hospitable', BASE_URL)
    errorUrl.searchParams.set('error', 'Token exchange failed. Please try again.')
    return NextResponse.redirect(errorUrl)
  }

  const tokens = await tokenRes.json()

  // Store tokens in Supabase
  const connectionId = await saveHospitableTokens(
    tokens.access_token,
    tokens.refresh_token,
    tokens.expires_in || 3600
  )

  if (!connectionId) {
    const errorUrl = new URL('/hospitable', BASE_URL)
    errorUrl.searchParams.set('error', 'Failed to save connection. Please try again.')
    return NextResponse.redirect(errorUrl)
  }

  // Redirect to Hospitable dashboard — connectionId goes in httpOnly cookie, NOT the URL
  const successUrl = new URL('/hospitable', BASE_URL)
  successUrl.searchParams.set('connected', 'true')
  const response = NextResponse.redirect(successUrl)

  // Set connectionId as httpOnly cookie
  response.cookies.set('hospitable_connection_id', connectionId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 30, // 30 days
  })

  // Clear the OAuth state cookie
  response.cookies.delete('hospitable_oauth_state')

  return response
}
