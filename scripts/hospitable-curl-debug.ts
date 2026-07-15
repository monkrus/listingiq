#!/usr/bin/env npx tsx
/**
 * Hospitable cURL debug script
 *
 * Makes the same API calls as the adapter and logs:
 *   1. The exact cURL equivalent (secrets redacted in console, full in .curl file)
 *   2. ISO timestamp of each request
 *   3. Full response (status, headers, body)
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/hospitable-curl-debug.ts
 *
 * Requires HOSPITABLE_CLIENT_ID and HOSPITABLE_CLIENT_SECRET in .env.local.
 * Will prompt for a PAT or connection_id if not provided via env.
 */

const BASE_URL = 'https://public.api.hospitable.com/v2'
const TOKEN_URL = 'https://auth.hospitable.com/oauth/token'

// ---- helpers ----

function redact(s: string, keep = 6): string {
  if (s.length <= keep) return '***'
  return s.slice(0, keep) + '***REDACTED***'
}

function toCurl(
  method: string,
  url: string,
  headers: Record<string, string>,
  body?: string
): string {
  let cmd = `curl -X ${method} '${url}'`
  for (const [k, v] of Object.entries(headers)) {
    cmd += ` \\\n  -H '${k}: ${v}'`
  }
  if (body) {
    cmd += ` \\\n  -d '${body}'`
  }
  return cmd
}

function toCurlRedacted(
  method: string,
  url: string,
  headers: Record<string, string>,
  body?: string
): string {
  const safeHeaders: Record<string, string> = {}
  for (const [k, v] of Object.entries(headers)) {
    if (k.toLowerCase() === 'authorization') {
      safeHeaders[k] = `Bearer ${redact(v.replace('Bearer ', ''))}`
    } else {
      safeHeaders[k] = v
    }
  }
  let safeBody = body
  if (safeBody) {
    // Redact client_secret and tokens in URL-encoded body
    safeBody = safeBody.replace(
      /client_secret=[^&]+/,
      `client_secret=${redact(process.env.HOSPITABLE_CLIENT_SECRET || '')}`
    )
    safeBody = safeBody.replace(
      /refresh_token=[^&]+/,
      'refresh_token=***REDACTED***'
    )
  }
  return toCurl(method, url, safeHeaders, safeBody)
}

async function loggedFetch(
  label: string,
  method: string,
  url: string,
  headers: Record<string, string>,
  body?: string
) {
  const timestamp = new Date().toISOString()

  console.log(`\n${'='.repeat(70)}`)
  console.log(`REQUEST: ${label}`)
  console.log(`TIMESTAMP: ${timestamp}`)
  console.log('='.repeat(70))

  // Print redacted cURL for sharing
  console.log('\n--- cURL (redacted, safe to share) ---')
  console.log(toCurlRedacted(method, url, headers, body))

  // Print full cURL for local use
  const fullCurl = toCurl(method, url, headers, body)
  console.log('\n--- cURL (FULL, do NOT share) ---')
  console.log(fullCurl)

  // Execute
  console.log('\n--- Sending request... ---')
  const res = await fetch(url, {
    method,
    headers,
    body: body || undefined,
  })

  const resBody = await res.text()
  console.log(`\nRESPONSE STATUS: ${res.status} ${res.statusText}`)
  console.log('RESPONSE HEADERS:')
  res.headers.forEach((v, k) => console.log(`  ${k}: ${v}`))
  console.log('\nRESPONSE BODY:')
  try {
    console.log(JSON.stringify(JSON.parse(resBody), null, 2))
  } catch {
    console.log(resBody)
  }

  return { status: res.status, body: resBody, timestamp, curl: fullCurl, curlRedacted: toCurlRedacted(method, url, headers, body) }
}

// ---- main ----

async function main() {
  const clientId = process.env.HOSPITABLE_CLIENT_ID
  const clientSecret = process.env.HOSPITABLE_CLIENT_SECRET

  if (!clientId || !clientSecret) {
    console.error('Missing HOSPITABLE_CLIENT_ID or HOSPITABLE_CLIENT_SECRET in env.')
    process.exit(1)
  }

  // Determine which token to use
  const pat = process.env.HOSPITABLE_PAT
  const refreshToken = process.env.HOSPITABLE_REFRESH_TOKEN

  let accessToken = pat

  // If we have a refresh token, try refreshing first
  if (refreshToken && !pat) {
    console.log('Found HOSPITABLE_REFRESH_TOKEN — attempting token refresh...')

    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
    }).toString()

    const result = await loggedFetch(
      'Token Refresh (POST /oauth/token)',
      'POST',
      TOKEN_URL,
      { 'Content-Type': 'application/x-www-form-urlencoded' },
      body
    )

    if (result.status === 200) {
      const data = JSON.parse(result.body)
      accessToken = data.access_token
      console.log('\nToken refresh succeeded. Using new access token.')
    } else {
      console.error('\nToken refresh FAILED. Cannot proceed without a valid token.')
      console.error('Set HOSPITABLE_PAT instead, or re-authorize via OAuth.')
      process.exit(1)
    }
  }

  if (!accessToken) {
    console.error(
      'No token available. Set one of:\n' +
        '  HOSPITABLE_PAT=xxx          (Personal Access Token)\n' +
        '  HOSPITABLE_REFRESH_TOKEN=xxx (OAuth refresh token from DB)\n'
    )
    process.exit(1)
  }

  // Fetch properties
  const propertiesUrl = `${BASE_URL}/properties?page=1&per_page=10&include=listings,details`

  const result = await loggedFetch(
    'Fetch Properties (GET /v2/properties)',
    'GET',
    propertiesUrl,
    {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
    }
  )

  // Summary
  console.log('\n' + '='.repeat(70))
  console.log('SUMMARY')
  console.log('='.repeat(70))
  console.log(`Properties request status: ${result.status}`)
  console.log(`Timestamp: ${result.timestamp}`)

  if (result.status === 200) {
    const data = JSON.parse(result.body)
    const count = data?.data?.length ?? 0
    console.log(`Properties returned: ${count}`)
  } else {
    console.log('\nFAILED — share the redacted cURL and timestamp with Patrick:')
    console.log(`\nTimestamp: ${result.timestamp}`)
    console.log(`\n${result.curlRedacted}`)
  }
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
