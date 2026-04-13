/**
 * Two-layer rate limiter for API routes.
 *
 * Layer 1 — In-memory sliding window (burst protection).
 *   Fast, no I/O. Resets on deploy, which is acceptable for short windows.
 *
 * Layer 2 — Persistent daily cap via Supabase.
 *   Survives deploys. Prevents sustained abuse across restarts.
 *   Gracefully degrades: if Supabase is unavailable, only Layer 1 applies.
 */

import { getSupabaseAdmin } from './supabase'

// ── Layer 1: in-memory burst limiter ──

const requests = new Map<string, number[]>()

// Clean up old entries every 5 minutes to prevent memory leaks
setInterval(() => {
  const cutoff = Date.now() - 60_000
  requests.forEach((times, key) => {
    const valid = times.filter((t: number) => t > cutoff)
    if (valid.length === 0) requests.delete(key)
    else requests.set(key, valid)
  })
}, 5 * 60_000)

/**
 * Check if a request should be rate-limited (burst protection).
 * @param ip - Client IP address
 * @param maxRequests - Max requests allowed in the window (default: 10)
 * @param windowMs - Time window in ms (default: 60s)
 * @returns { limited: true } if rate-limited, { limited: false } otherwise
 */
export function rateLimit(
  ip: string,
  maxRequests = 10,
  windowMs = 60_000
): { limited: boolean; remaining: number } {
  const now = Date.now()
  const cutoff = now - windowMs
  const times = (requests.get(ip) ?? []).filter(t => t > cutoff)

  if (times.length >= maxRequests) {
    return { limited: true, remaining: 0 }
  }

  times.push(now)
  requests.set(ip, times)
  return { limited: false, remaining: maxRequests - times.length }
}

// ── Layer 2: persistent daily cap via Supabase ──

// In-memory cache of daily counts so we don't hit Supabase on every request.
// Key: "ip:YYYY-MM-DD", Value: count
const dailyCache = new Map<string, number>()

/**
 * Check if an IP has exceeded the daily request cap.
 * Uses Supabase for persistence (survives deploys), with an in-memory
 * cache to avoid a DB call on every request.
 *
 * Degrades gracefully: returns { limited: false } if Supabase is unavailable.
 *
 * @param ip - Client IP address
 * @param route - Route identifier (e.g. 'analyze', 'analyze-photos')
 * @param maxDaily - Max requests per day per IP (default: 50)
 */
export async function dailyRateLimit(
  ip: string,
  route: string,
  maxDaily = 50
): Promise<{ limited: boolean }> {
  const db = getSupabaseAdmin()
  if (!db) return { limited: false } // graceful degradation

  const today = new Date().toISOString().slice(0, 10) // YYYY-MM-DD
  const cacheKey = `${ip}:${route}:${today}`

  // Check in-memory cache first
  const cached = dailyCache.get(cacheKey)
  if (cached !== undefined && cached >= maxDaily) {
    return { limited: true }
  }

  try {
    // Upsert a counter row and increment atomically
    const { data, error } = await db.rpc('increment_daily_rate_limit', {
      p_ip: ip,
      p_route: route,
      p_date: today,
    })

    if (error) {
      // DB error — fall back to in-memory only (don't block the request)
      console.warn('[rate-limit] Supabase daily cap check failed:', error.message)
      return { limited: false }
    }

    const count = typeof data === 'number' ? data : 0
    dailyCache.set(cacheKey, count)

    return { limited: count >= maxDaily }
  } catch {
    return { limited: false } // graceful degradation
  }
}
