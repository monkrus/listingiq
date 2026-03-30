/**
 * Simple in-memory rate limiter for API routes.
 * Tracks requests per IP with a sliding window.
 * Works on single-instance deployments (Railway, Vercel serverless per-function).
 */

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
 * Check if a request should be rate-limited.
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
