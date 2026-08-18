import { NextRequest, NextResponse } from 'next/server'
import { saveHospitableTokens } from '@/app/lib/supabase'
import { findConnectionByPropertyIds } from '@/app/lib/pms-reports'
import { logger } from '@/app/lib/logger'

/**
 * Hospitable OAuth callback handler.
 *
 * Two initiation paths:
 * A) From ListingIQ (/api/hospitable/authorize) — state cookie is set, validated here (CSRF)
 * B) From Hospitable Marketplace (one-click OAuth) — no state cookie exists, skip validation
 *
 * Flow:
 * 1. Hospitable redirects here with ?code=XXX (and optionally &state=YYY)
 * 2. If state cookie exists (path A), validate state matches (CSRF protection)
 * 3. If no state cookie (path B / Hospitable-initiated), skip state check
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

  // CSRF: validate state when flow was initiated from ListingIQ (state cookie exists).
  // When initiated from Hospitable Marketplace (one-click OAuth), no state cookie is set,
  // so we skip validation — Hospitable is the trusted initiator in that case.
  const savedState = req.cookies.get('hospitable_oauth_state')?.value
  if (savedState) {
    // Flow initiated from ListingIQ — state must match
    if (!state || state !== savedState) {
      const errorUrl = new URL('/hospitable', BASE_URL)
      errorUrl.searchParams.set('error', 'Invalid OAuth state. Please try connecting again.')
      const response = NextResponse.redirect(errorUrl)
      response.cookies.delete('hospitable_oauth_state')
      return response
    }
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
    logger.error('hospitable', 'token_exchange_failed', { status: tokenRes.status, body })
    const errorUrl = new URL('/hospitable', BASE_URL)
    errorUrl.searchParams.set('error', 'Token exchange failed. Please try again.')
    return NextResponse.redirect(errorUrl)
  }

  const tokens = await tokenRes.json()

  // Try to find an existing connection by checking which properties this account has
  // (preserves report history across disconnect/reconnect even when tokens rotate)
  let reuseConnectionId: string | undefined
  try {
    const propRes = await fetch('https://public.api.hospitable.com/v2/properties?per_page=5', {
      headers: { Authorization: `Bearer ${tokens.access_token}`, Accept: 'application/json' },
    })
    if (propRes.ok) {
      const propData = await propRes.json()
      const propertyIds = (propData?.data || []).map((p: { id: string }) => String(p.id)).filter(Boolean)
      const existingConnId = await findConnectionByPropertyIds('hospitable', propertyIds)
      if (existingConnId) reuseConnectionId = existingConnId
    }
  } catch {
    // Best-effort — continue with new connection if lookup fails
  }

  // Store tokens in Supabase (reuse existing connection if found)
  const connectionId = await saveHospitableTokens(
    tokens.access_token,
    tokens.refresh_token,
    tokens.expires_in || 3600,
    reuseConnectionId
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
