import { NextRequest, NextResponse } from 'next/server'
import { deleteHospitableConnection } from '@/app/lib/supabase'

/**
 * POST /api/integrations/hospitable/disconnect
 *
 * Deletes the Hospitable connection from DB and clears the httpOnly cookie.
 */
export async function POST(req: NextRequest) {
  const connectionId = req.cookies.get('hospitable_connection_id')?.value
  if (connectionId) {
    await deleteHospitableConnection(connectionId)
  }

  const response = NextResponse.json({ disconnected: true })
  response.cookies.delete('hospitable_connection_id')
  return response
}
