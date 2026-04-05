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
