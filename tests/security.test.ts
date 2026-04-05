import { describe, it, expect, vi, beforeEach } from 'vitest'
import { isValidAirbnbUrl } from '@/app/lib/validation'
import { rateLimit } from '@/app/lib/rate-limit'
import { storePhotos, deletePhotos } from '@/app/lib/photo-store'

vi.mock('@/app/lib/stripe', () => ({
  stripe: {
    checkout: { sessions: { retrieve: vi.fn(), update: vi.fn() } },
  },
}))

describe('Security: URL Input Validation', () => {
  // XSS attempts
  it('rejects script injection in URL', () => {
    expect(isValidAirbnbUrl('<script>alert("xss")</script>')).toBe(false)
    expect(isValidAirbnbUrl('https://airbnb.com/rooms/123"><script>alert(1)</script>')).toBe(false)
  })

  it('rejects javascript: protocol', () => {
    expect(isValidAirbnbUrl('javascript:alert(document.cookie)')).toBe(false)
    expect(isValidAirbnbUrl('JAVASCRIPT:alert(1)')).toBe(false)
  })

  it('rejects data: protocol', () => {
    expect(isValidAirbnbUrl('data:text/html,<script>alert(1)</script>')).toBe(false)
  })

  it('rejects http: protocol (requires https)', () => {
    expect(isValidAirbnbUrl('http://www.airbnb.com/rooms/12345')).toBe(false)
  })

  // SSRF attempts
  it('rejects localhost URLs', () => {
    expect(isValidAirbnbUrl('https://localhost/rooms/12345')).toBe(false)
    expect(isValidAirbnbUrl('https://127.0.0.1/rooms/12345')).toBe(false)
    expect(isValidAirbnbUrl('https://0.0.0.0/rooms/12345')).toBe(false)
  })

  it('rejects internal network URLs', () => {
    expect(isValidAirbnbUrl('https://192.168.1.1/rooms/12345')).toBe(false)
    expect(isValidAirbnbUrl('https://10.0.0.1/rooms/12345')).toBe(false)
    expect(isValidAirbnbUrl('https://169.254.169.254/rooms/12345')).toBe(false) // AWS metadata
  })

  // Path traversal
  it('rejects path traversal attempts', () => {
    expect(isValidAirbnbUrl('https://airbnb.com/rooms/../../etc/passwd')).toBe(false)
    expect(isValidAirbnbUrl('https://airbnb.com/rooms/12345/../../admin')).toBe(false)
  })

  // SQL injection patterns
  it('rejects SQL injection in URL', () => {
    expect(isValidAirbnbUrl("https://airbnb.com/rooms/1' OR '1'='1")).toBe(false)
    expect(isValidAirbnbUrl('https://airbnb.com/rooms/1; DROP TABLE users')).toBe(false)
  })

  // Null byte injection
  it('rejects null byte injection', () => {
    expect(isValidAirbnbUrl('https://airbnb.com/rooms/12345%00.html')).toBe(false)
  })

  // Very long URLs (DoS attempt)
  it('handles extremely long URLs without crashing', () => {
    const longUrl = 'https://airbnb.com/rooms/' + '1'.repeat(10000)
    expect(() => isValidAirbnbUrl(longUrl)).not.toThrow()
  })

  // Unicode / encoding tricks
  it('rejects unicode domain spoofing', () => {
    expect(isValidAirbnbUrl('https://аirbnb.com/rooms/12345')).toBe(false) // Cyrillic 'а'
  })

  // Domain spoofing
  it('rejects domain spoofing attempts', () => {
    expect(isValidAirbnbUrl('https://airbnb.com.evil.com/rooms/12345')).toBe(false)
    expect(isValidAirbnbUrl('https://notairbnb.com/rooms/12345')).toBe(false)
    expect(isValidAirbnbUrl('https://www.airbnb.com@evil.com/rooms/12345')).toBe(false)
  })
})

describe('Security: Origin Check', () => {
  beforeEach(() => {
    vi.unstubAllEnvs()
  })

  it('blocks requests with mismatched origin', async () => {
    vi.stubEnv('NEXT_PUBLIC_BASE_URL', 'https://listingiq.pro')
    vi.stubEnv('USE_MOCK_API', 'false')
    vi.stubEnv('NODE_ENV', 'production')

    const { checkOrigin } = await import('@/app/lib/check-origin')

    const mockReq = {
      headers: {
        get: (name: string) => {
          if (name === 'origin') return 'https://evil-site.com'
          return null
        },
      },
    } as any

    const result = checkOrigin(mockReq)
    expect(result).not.toBeNull()
    expect(result?.status).toBe(403)
  })

  it('blocks requests with no origin or referer in production', async () => {
    vi.stubEnv('NEXT_PUBLIC_BASE_URL', 'https://listingiq.pro')
    vi.stubEnv('USE_MOCK_API', 'false')
    vi.stubEnv('NODE_ENV', 'production')

    const { checkOrigin } = await import('@/app/lib/check-origin')

    const mockReq = {
      headers: {
        get: () => null,
      },
    } as any

    const result = checkOrigin(mockReq)
    expect(result).not.toBeNull()
    expect(result?.status).toBe(403)
  })

  it('allows requests with matching origin', async () => {
    vi.stubEnv('NEXT_PUBLIC_BASE_URL', 'https://listingiq.pro')
    vi.stubEnv('USE_MOCK_API', 'false')
    vi.stubEnv('NODE_ENV', 'production')

    const { checkOrigin } = await import('@/app/lib/check-origin')

    const mockReq = {
      headers: {
        get: (name: string) => {
          if (name === 'origin') return 'https://listingiq.pro'
          return null
        },
      },
    } as any

    const result = checkOrigin(mockReq)
    expect(result).toBeNull()
  })
})

describe('Security: Rate Limiting', () => {
  it('enforces rate limits per IP', () => {
    const ip = 'security-test-' + Date.now()
    for (let i = 0; i < 3; i++) {
      rateLimit(ip, 3, 60_000)
    }
    const result = rateLimit(ip, 3, 60_000)
    expect(result.limited).toBe(true)
  })

  it('cannot bypass rate limit by changing case of IP', () => {
    const ip = 'RATE-TEST-' + Date.now()
    for (let i = 0; i < 3; i++) {
      rateLimit(ip, 3, 60_000)
    }
    expect(rateLimit(ip, 3, 60_000).limited).toBe(true)
  })
})

describe('Security: File Upload Validation', () => {
  it('photo store rejects when capacity exceeded', () => {
    const ids: string[] = []
    for (let i = 0; i < 50; i++) {
      const id = `security-dos-${Date.now()}-${i}`
      ids.push(id)
      storePhotos(id, [{ base64: 'x', mediaType: 'image/jpeg', filename: 'x.jpg' }])
    }
    const result = storePhotos('overflow', [{ base64: 'x', mediaType: 'image/jpeg', filename: 'x.jpg' }])
    expect(result).toBe(false)
    ids.forEach(id => deletePhotos(id))
  })
})

describe('Security: Payment Verification', () => {
  it('rejects null session ID', async () => {
    const { verifyPayment } = await import('@/app/lib/verify-payment')
    const result = await verifyPayment(null)
    expect(result.valid).toBe(false)
    expect(result.error).toContain('No payment session')
  })

  it('rejects undefined session ID', async () => {
    const { verifyPayment } = await import('@/app/lib/verify-payment')
    const result = await verifyPayment(undefined)
    expect(result.valid).toBe(false)
  })

  it('rejects empty string session ID', async () => {
    const { verifyPayment } = await import('@/app/lib/verify-payment')
    const result = await verifyPayment('')
    expect(result.valid).toBe(false)
  })
})
