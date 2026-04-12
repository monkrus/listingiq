import { describe, it, expect, vi, beforeEach } from 'vitest'

// check-origin reads process.env at call time, so we stub before each test
beforeEach(() => {
  vi.unstubAllEnvs()
})

function mockReq(headers: Record<string, string | null>) {
  return {
    headers: {
      get: (name: string) => headers[name] ?? null,
    },
  } as any
}

describe('check-origin', () => {
  describe('production mode', () => {
    beforeEach(() => {
      vi.stubEnv('USE_MOCK_API', 'false')
      vi.stubEnv('NODE_ENV', 'production')
      vi.stubEnv('NEXT_PUBLIC_BASE_URL', 'https://listingiq.pro')
    })

    it('allows matching origin', async () => {
      const { checkOrigin } = await import('@/app/lib/check-origin')
      const result = checkOrigin(mockReq({ origin: 'https://listingiq.pro' }))
      expect(result).toBeNull()
    })

    it('blocks mismatched origin', async () => {
      const { checkOrigin } = await import('@/app/lib/check-origin')
      const result = checkOrigin(mockReq({ origin: 'https://evil.com' }))
      expect(result).not.toBeNull()
      expect(result!.status).toBe(403)
    })

    it('falls back to referer when no origin', async () => {
      const { checkOrigin } = await import('@/app/lib/check-origin')
      const result = checkOrigin(mockReq({ referer: 'https://listingiq.pro/pricing' }))
      expect(result).toBeNull()
    })

    it('blocks mismatched referer', async () => {
      const { checkOrigin } = await import('@/app/lib/check-origin')
      const result = checkOrigin(mockReq({ referer: 'https://evil.com/steal' }))
      expect(result!.status).toBe(403)
    })

    it('blocks when neither origin nor referer present', async () => {
      const { checkOrigin } = await import('@/app/lib/check-origin')
      const result = checkOrigin(mockReq({}))
      expect(result!.status).toBe(403)
    })

    it('returns 500 when NEXT_PUBLIC_BASE_URL not configured', async () => {
      vi.stubEnv('NEXT_PUBLIC_BASE_URL', '')
      const { checkOrigin } = await import('@/app/lib/check-origin')
      const result = checkOrigin(mockReq({ origin: 'https://listingiq.pro' }))
      expect(result!.status).toBe(500)
    })

    it('handles malformed referer gracefully', async () => {
      const { checkOrigin } = await import('@/app/lib/check-origin')
      const result = checkOrigin(mockReq({ referer: 'not-a-url' }))
      expect(result!.status).toBe(403)
    })

    it('origin check is exact (no subdomain bypass)', async () => {
      const { checkOrigin } = await import('@/app/lib/check-origin')
      const result = checkOrigin(mockReq({ origin: 'https://fake.listingiq.pro' }))
      expect(result!.status).toBe(403)
    })
  })

  describe('development / mock bypass', () => {
    it('skips check in development mode', async () => {
      vi.stubEnv('NODE_ENV', 'development')
      vi.stubEnv('USE_MOCK_API', 'false')
      const { checkOrigin } = await import('@/app/lib/check-origin')
      const result = checkOrigin(mockReq({ origin: 'https://evil.com' }))
      expect(result).toBeNull()
    })

    it('skips check when USE_MOCK_API is true', async () => {
      vi.stubEnv('NODE_ENV', 'production')
      vi.stubEnv('USE_MOCK_API', 'true')
      const { checkOrigin } = await import('@/app/lib/check-origin')
      const result = checkOrigin(mockReq({ origin: 'https://evil.com' }))
      expect(result).toBeNull()
    })
  })
})
