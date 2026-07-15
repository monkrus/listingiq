import { NextResponse } from 'next/server'

/**
 * POST /api/integrations/hospitable/disconnect
 *
 * Clears the hospitable_connection_id httpOnly cookie.
 */
export async function POST() {
  const response = NextResponse.json({ disconnected: true })
  response.cookies.delete('hospitable_connection_id')
  return response
}
