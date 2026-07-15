import { NextResponse } from 'next/server'
import crypto from 'crypto'

/**
 * Redirects to Hospitable's OAuth authorization page.
 *
 * Visit: https://listingiq.pro/api/hospitable/authorize
 * → Redirects to Hospitable login → user grants access
 * → Hospitable redirects back to /api/hospitable/callback with ?code=XXX
 *
 * Security: Sets an httpOnly cookie with a random state nonce for CSRF protection.
 */

const AUTH_URL = 'https://auth.hospitable.com/oauth/authorize'
const CLIENT_ID = process.env.HOSPITABLE_CLIENT_ID!
const REDIRECT_URI = process.env.HOSPITABLE_REDIRECT_URI || 'https://listingiq.pro/api/hospitable/callback'

export async function GET() {
  const state = crypto.randomBytes(32).toString('hex')

  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    response_type: 'code',
    scope: 'properties:read',
    state,
  })

  const response = NextResponse.redirect(`${AUTH_URL}?${params.toString()}`)

  // Set state in httpOnly cookie for CSRF validation in callback
  response.cookies.set('hospitable_oauth_state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/api/hospitable/callback',
    maxAge: 600, // 10 minutes
  })

  return response
}
