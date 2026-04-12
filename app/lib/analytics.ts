import { getSupabaseAdmin } from './supabase'

interface AnalyticsEvent {
  route: 'analyze' | 'analyze-photos'
  plan?: string
  success: boolean
  duration_ms: number
  is_demo?: boolean
  is_reaccess?: boolean
  cache_hit?: boolean
  photo_count?: number
  error?: string
}

/**
 * Log an analytics event to Supabase. Fire-and-forget — never blocks
 * the response or throws. Silently skips if Supabase is unavailable.
 */
export function logAnalyticsEvent(event: AnalyticsEvent): void {
  const db = getSupabaseAdmin()
  if (!db) return

  db.from('analytics_events')
    .insert({
      route: event.route,
      plan: event.plan || null,
      success: event.success,
      duration_ms: event.duration_ms,
      is_demo: event.is_demo || false,
      is_reaccess: event.is_reaccess || false,
      cache_hit: event.cache_hit || false,
      photo_count: event.photo_count || null,
      error: event.error || null,
    })
    .then(({ error }) => {
      if (error) console.warn('[analytics] Failed to log event:', error.message)
    })
}
