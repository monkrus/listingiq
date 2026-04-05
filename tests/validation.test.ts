import { describe, it, expect } from 'vitest'
import { isValidAirbnbUrl } from '@/app/lib/validation'

describe('isValidAirbnbUrl', () => {
  // Valid URLs
  it('accepts standard airbnb.com listing URL', () => {
    expect(isValidAirbnbUrl('https://www.airbnb.com/rooms/12345')).toBe(true)
  })

  it('accepts airbnb.com without www', () => {
    expect(isValidAirbnbUrl('https://airbnb.com/rooms/12345')).toBe(true)
  })

  it('accepts URL with trailing slash', () => {
    expect(isValidAirbnbUrl('https://www.airbnb.com/rooms/12345/')).toBe(true)
  })

  it('accepts international airbnb domains', () => {
    expect(isValidAirbnbUrl('https://www.airbnb.co.uk/rooms/99999')).toBe(true)
    expect(isValidAirbnbUrl('https://www.airbnb.com.au/rooms/99999')).toBe(true)
    expect(isValidAirbnbUrl('https://www.airbnb.de/rooms/99999')).toBe(true)
  })

  it('accepts long room IDs', () => {
    expect(isValidAirbnbUrl('https://www.airbnb.com/rooms/1234567890')).toBe(true)
  })

  // Invalid URLs
  it('rejects non-airbnb domains', () => {
    expect(isValidAirbnbUrl('https://www.booking.com/rooms/12345')).toBe(false)
    expect(isValidAirbnbUrl('https://www.vrbo.com/rooms/12345')).toBe(false)
  })

  it('rejects URLs without /rooms/ path', () => {
    expect(isValidAirbnbUrl('https://www.airbnb.com/experiences/12345')).toBe(false)
    expect(isValidAirbnbUrl('https://www.airbnb.com/')).toBe(false)
  })

  it('rejects URLs without room ID', () => {
    expect(isValidAirbnbUrl('https://www.airbnb.com/rooms/')).toBe(false)
    expect(isValidAirbnbUrl('https://www.airbnb.com/rooms/abc')).toBe(false)
  })

  it('rejects empty strings and garbage', () => {
    expect(isValidAirbnbUrl('')).toBe(false)
    expect(isValidAirbnbUrl('not a url')).toBe(false)
    expect(isValidAirbnbUrl('javascript:alert(1)')).toBe(false)
  })

  it('rejects http (requires https)', () => {
    expect(isValidAirbnbUrl('http://www.airbnb.com/rooms/12345')).toBe(false)
  })

  // Security: XSS / injection attempts
  it('rejects XSS in URL', () => {
    expect(isValidAirbnbUrl('https://www.airbnb.com/rooms/12345<script>alert(1)</script>')).toBe(false)
    expect(isValidAirbnbUrl('"><img src=x onerror=alert(1)>')).toBe(false)
  })

  it('rejects domain spoofing attempts', () => {
    expect(isValidAirbnbUrl('https://airbnb.com.evil.com/rooms/12345')).toBe(false)
    expect(isValidAirbnbUrl('https://notairbnb.com/rooms/12345')).toBe(false)
    expect(isValidAirbnbUrl('https://www.airbnb.com@evil.com/rooms/12345')).toBe(false)
  })
})
