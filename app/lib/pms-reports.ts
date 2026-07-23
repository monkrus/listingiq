/**
 * PMS report persistence — saves analysis results from Hospitable/Hostex
 * integrations to Supabase so users can revisit them.
 */

import { getSupabaseAdmin } from './supabase'
import { logger } from './logger'

export interface PmsReportInput {
  platform: 'hospitable' | 'hostex'
  connectionId: string
  propertyId: string
  sessionId: string | null
  plan: string
  listingData: object
  reportData: object
  overallScore: number
}

export interface PmsReport {
  id: string
  platform: string
  connection_id: string
  property_id: string
  session_id: string | null
  plan: string
  listing_data: Record<string, unknown>
  report_data: Record<string, unknown>
  overall_score: number
  created_at: string
}

/** Save a PMS integration report. Returns the report ID or null. */
export async function savePmsReport(input: PmsReportInput): Promise<string | null> {
  const db = getSupabaseAdmin()
  if (!db) {
    logger.warn(input.platform, 'save_report_skipped', { reason: 'supabase_not_configured' })
    return null
  }

  const { data, error } = await db
    .from('pms_reports')
    .insert({
      platform: input.platform,
      connection_id: input.connectionId,
      property_id: input.propertyId,
      session_id: input.sessionId,
      plan: input.plan,
      listing_data: input.listingData,
      report_data: input.reportData,
      overall_score: input.overallScore,
    })
    .select('id')
    .single()

  if (error) {
    logger.error(input.platform, 'save_report_failed', { error: error.message, propertyId: input.propertyId })
    return null
  }

  return data.id
}

/** Get all reports for a platform (persists across reconnects). */
export async function getPmsReports(connectionId: string, platform?: string): Promise<PmsReport[]> {
  const db = getSupabaseAdmin()
  if (!db) return []

  let query = db
    .from('pms_reports')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(50)

  if (platform) {
    query = query.eq('platform', platform).eq('connection_id', connectionId)
  } else {
    query = query.eq('connection_id', connectionId)
  }

  const { data, error } = await query

  if (error) {
    logger.error(platform || 'pms', 'get_reports_failed', { error: error.message, connectionId })
    return []
  }

  return (data || []) as PmsReport[]
}

/** Get a single report by ID. */
export async function getPmsReport(reportId: string): Promise<PmsReport | null> {
  const db = getSupabaseAdmin()
  if (!db) return null

  const { data, error } = await db
    .from('pms_reports')
    .select('*')
    .eq('id', reportId)
    .single()

  if (error || !data) return null
  return data as PmsReport
}

/** Get a report by Stripe session ID (for email re-access). */
export async function getPmsReportBySession(sessionId: string): Promise<PmsReport | null> {
  const db = getSupabaseAdmin()
  if (!db) return null

  const { data, error } = await db
    .from('pms_reports')
    .select('*')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  if (error || !data) return null
  return data as PmsReport
}

/** Get reports for a specific property. */
export async function getPropertyReports(connectionId: string, propertyId: string): Promise<PmsReport[]> {
  const db = getSupabaseAdmin()
  if (!db) return []

  const { data, error } = await db
    .from('pms_reports')
    .select('*')
    .eq('connection_id', connectionId)
    .eq('property_id', propertyId)
    .order('created_at', { ascending: false })
    .limit(10)

  if (error) return []
  return (data || []) as PmsReport[]
}

/** Delete all reports for a connection. */
export async function clearPmsReports(connectionId: string, platform?: string): Promise<boolean> {
  const db = getSupabaseAdmin()
  if (!db) return false

  let query = db
    .from('pms_reports')
    .delete()
    .eq('connection_id', connectionId)

  if (platform) {
    query = query.eq('platform', platform)
  }

  const { error } = await query
  if (error) {
    logger.error(platform || 'pms', 'clear_reports_failed', { error: error.message, connectionId })
    return false
  }
  return true
}

/** Find an existing connection_id that has reports for any of the given property IDs.
 *  Used to link a new OAuth connection to an existing one (preserves history on reconnect). */
export async function findConnectionByPropertyIds(
  platform: string,
  propertyIds: string[]
): Promise<string | null> {
  const db = getSupabaseAdmin()
  if (!db || propertyIds.length === 0) return null

  const { data, error } = await db
    .from('pms_reports')
    .select('connection_id')
    .eq('platform', platform)
    .in('property_id', propertyIds)
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  if (error || !data) return null
  return data.connection_id
}
