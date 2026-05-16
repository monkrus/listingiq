/**
 * Simple in-memory cache for analysis results.
 * Ensures the same listing + plan returns identical results,
 * eliminating score/text variation between runs.
 *
 * Cache entries expire after 24 hours.
 * Keyed by normalized listing URL + plan.
 */

interface CacheEntry {
  data: unknown
  createdAt: number
}

const cache = new Map<string, CacheEntry>()
const TTL = 24 * 60 * 60_000 // 24 hours

// Clean up expired entries every 30 minutes
setInterval(() => {
  const now = Date.now()
  cache.forEach((entry, key) => {
    if (now - entry.createdAt > TTL) cache.delete(key)
  })
}, 30 * 60_000)

/**
 * Normalize an Airbnb URL to extract the room ID.
 * e.g. "https://www.airbnb.com/rooms/12345?check_in=..." → "12345"
 */
function normalizeUrl(url: string): string {
  try {
    const match = url.match(/\/rooms\/(\d+)/)
    return match ? match[1] : url.trim().toLowerCase()
  } catch {
    return url.trim().toLowerCase()
  }
}

function buildKey(url: string, plan: string): string {
  return `${normalizeUrl(url)}:${plan}`
}

export function getCachedReport<T = unknown>(url: string, plan: string): T | null {
  const key = buildKey(url, plan)
  const entry = cache.get(key)
  if (!entry) return null
  if (Date.now() - entry.createdAt > TTL) {
    cache.delete(key)
    return null
  }
  return entry.data as T
}

export function setCachedReport(url: string, plan: string, data: unknown): void {
  const key = buildKey(url, plan)
  cache.set(key, { data, createdAt: Date.now() })
}

/** Merge photo results into an existing cached report (called after photo analysis completes) */
export function updateCachedReportPhotos(url: string, plan: string, photoResults: unknown, photoPreviews?: unknown): void {
  const key = buildKey(url, plan)
  const entry = cache.get(key)
  if (!entry || Date.now() - entry.createdAt > TTL) return
  const report = entry.data as Record<string, unknown>
  report.cachedPhotoResults = photoResults
  report.cachedPhotoPreviews = photoPreviews ?? null
}
