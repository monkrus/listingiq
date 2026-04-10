/**
 * Validate that a URL looks like a real Airbnb listing URL.
 * Shared between client (page.tsx) and server (scraper).
 */
export function isValidAirbnbUrl(url: string): boolean {
  try {
    const u = new URL(url)
    // Hostname: must be airbnb.XX or airbnb.XX.YY (e.g. airbnb.com, airbnb.co.uk)
    // Blocks domain spoofing like airbnb.com.evil.com
    const validHost = /^(www\.)?airbnb\.([a-z]{2,3})(\.([a-z]{2}))?$/.test(u.hostname)
    // Pathname: must be /rooms/DIGITS only — no trailing scripts, injections, etc.
    const validPath = /^\/rooms\/\d+\/?$/.test(u.pathname)
    // Protocol must be https
    const validProtocol = u.protocol === 'https:'
    return validHost && validPath && validProtocol
  } catch {
    return false
  }
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
