import { NextRequest, NextResponse } from 'next/server'

/**
 * Validate that the request comes from our own site.
 * Checks Origin header (set by browsers on POST/CORS) and falls back to Referer.
 * Returns null if valid, or a 403 NextResponse if blocked.
 */
export function checkOrigin(req: NextRequest): NextResponse | null {
  // Skip in development / mock mode
  if (process.env.USE_MOCK_API === 'true' || process.env.NODE_ENV === 'development') {
    return null
  }

  const origin = req.headers.get('origin')
  const referer = req.headers.get('referer')
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL

  // Fail closed: if no base URL is configured in production, block all requests
  if (!baseUrl) {
    console.error('[check-origin] NEXT_PUBLIC_BASE_URL not configured — blocking request. Set this env var to your production URL.')
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 })
  }

  const allowed = new URL(baseUrl).origin

  // Check Origin header first (most reliable for POST requests)
  if (origin) {
    if (origin === allowed) return null
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Fall back to Referer
  if (referer) {
    try {
      if (new URL(referer).origin === allowed) return null
    } catch { /* invalid referer */ }
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // No Origin or Referer — block in production (server-to-server calls from scripts)
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
}
