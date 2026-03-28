/**
 * Validate that a URL looks like a real Airbnb listing URL.
 * Shared between client (page.tsx) and server (scraper).
 */
export function isValidAirbnbUrl(url: string): boolean {
  try {
    const u = new URL(url)
    return (
      /^(www\.)?airbnb\.[a-z.]+$/.test(u.hostname) &&
      /\/rooms\/\d+/.test(u.pathname)
    )
  } catch {
    return false
  }
}
