/**
 * Validate that a URL looks like a real Airbnb listing URL.
 * Shared between client (page.tsx) and server (scraper).
 */
export function isValidAirbnbUrl(url: string): boolean {
  try {
    // Auto-prepend https:// if no protocol given
    const normalized = /^https?:\/\//i.test(url) ? url : `https://${url}`
    const u = new URL(normalized)
    // Hostname: must be airbnb.XX or airbnb.XX.YY (e.g. airbnb.com, airbnb.co.uk)
    // Blocks domain spoofing like airbnb.com.evil.com
    const validHost = /^(www\.)?airbnb\.([a-z]{2,3})(\.([a-z]{2}))?$/.test(u.hostname)
    // Pathname: /rooms/DIGITS with optional clean trailing segments (e.g. /photos)
    const validPath = /^\/rooms\/\d+(\/[\w-]*)*\/?$/.test(u.pathname)
    return validHost && validPath
  } catch {
    return false
  }
}

/** Normalize an Airbnb URL to a clean canonical form for the scraper */
export function normalizeAirbnbUrl(url: string): string {
  const withProtocol = /^https?:\/\//i.test(url) ? url : `https://${url}`
  const u = new URL(withProtocol)
  const match = u.pathname.match(/\/rooms\/(\d+)/)
  if (!match) return withProtocol
  return `https://${u.hostname}/rooms/${match[1]}`
}

/** Allowed hostnames for Airbnb photo CDN URLs (SSRF prevention) */
const ALLOWED_PHOTO_HOSTS = [
  'a0.muscache.com',
  'a1.muscache.com',
  'a2.muscache.com',
]

/**
 * Validate that a URL points to an Airbnb photo CDN.
 * Prevents SSRF by rejecting URLs to internal/arbitrary hosts.
 */
export function isValidPhotoUrl(url: string): boolean {
  try {
    const u = new URL(url)
    if (u.protocol !== 'https:') return false
    return ALLOWED_PHOTO_HOSTS.includes(u.hostname)
  } catch {
    return false
  }
}
