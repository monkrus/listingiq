import { NextRequest, NextResponse } from 'next/server'
import { saveHospitableTokens } from '@/app/lib/supabase'

/**
 * Hospitable OAuth callback handler.
 *
 * Flow:
 * 1. User visits /api/hospitable/authorize -> redirected to Hospitable login
 * 2. After granting access, Hospitable redirects here with ?code=XXX
 * 3. We exchange the code for an access_token + refresh_token
 * 4. Store tokens in Supabase and redirect to /hospitable with connection_id
 */

const TOKEN_URL = 'https://auth.hospitable.com/oauth/token'
const CLIENT_ID = process.env.HOSPITABLE_CLIENT_ID!
const CLIENT_SECRET = process.env.HOSPITABLE_CLIENT_SECRET!
const REDIRECT_URI = process.env.HOSPITABLE_REDIRECT_URI || 'https://listingiq.pro/api/hospitable/callback'
const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'https://listingiq.pro'

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code')
  const error = req.nextUrl.searchParams.get('error')

  if (error) {
    const desc = req.nextUrl.searchParams.get('error_description') || error
    const errorUrl = new URL('/hospitable', BASE_URL)
    errorUrl.searchParams.set('error', desc)
    return NextResponse.redirect(errorUrl)
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

  // Redirect to Hospitable dashboard with connection_id
  const successUrl = new URL('/hospitable', BASE_URL)
  successUrl.searchParams.set('connected', connectionId)
  return NextResponse.redirect(successUrl)
}
