import { NextResponse } from 'next/server'

/**
 * Redirects to Hospitable's OAuth authorization page.
 *
 * Visit: https://listingiq.pro/api/hospitable/authorize
 * → Redirects to Hospitable login → user grants access
 * → Hospitable redirects back to /api/hospitable/callback with ?code=XXX
 */

const AUTH_URL = 'https://auth.hospitable.com/oauth/authorize'
const CLIENT_ID = process.env.HOSPITABLE_CLIENT_ID!
const REDIRECT_URI = process.env.HOSPITABLE_REDIRECT_URI || 'https://listingiq.pro/api/hospitable/callback'

export async function GET() {
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    response_type: 'code',
    scope: 'properties:read properties:write reviews:read',
  })

  return NextResponse.redirect(`${AUTH_URL}?${params.toString()}`)
}
