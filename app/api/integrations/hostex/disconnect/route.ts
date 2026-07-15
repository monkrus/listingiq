import { NextResponse } from 'next/server'

/**
 * POST /api/integrations/hostex/disconnect
 *
 * Clears the hostex_connection_id httpOnly cookie.
 */
export async function POST() {
  const response = NextResponse.json({ disconnected: true })
  response.cookies.delete('hostex_connection_id')
  return response
}
