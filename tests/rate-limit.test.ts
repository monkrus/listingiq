import { describe, it, expect } from 'vitest'
import { rateLimit } from '@/app/lib/rate-limit'

describe('rateLimit', () => {
  it('allows requests under the limit', () => {
    const ip = 'test-allow-' + Date.now()
    const result = rateLimit(ip, 5, 60_000)
    expect(result.limited).toBe(false)
    expect(result.remaining).toBe(4)
  })

  it('blocks after exceeding limit', () => {
    const ip = 'test-block-' + Date.now()
    for (let i = 0; i < 3; i++) {
      rateLimit(ip, 3, 60_000)
    }
    const result = rateLimit(ip, 3, 60_000)
    expect(result.limited).toBe(true)
    expect(result.remaining).toBe(0)
  })

  it('tracks different IPs independently', () => {
    const ip1 = 'test-ip1-' + Date.now()
    const ip2 = 'test-ip2-' + Date.now()
    for (let i = 0; i < 3; i++) {
      rateLimit(ip1, 3, 60_000)
    }
    const result1 = rateLimit(ip1, 3, 60_000)
    const result2 = rateLimit(ip2, 3, 60_000)
    expect(result1.limited).toBe(true)
    expect(result2.limited).toBe(false)
  })

  it('decrements remaining count correctly', () => {
    const ip = 'test-remaining-' + Date.now()
    expect(rateLimit(ip, 5, 60_000).remaining).toBe(4)
    expect(rateLimit(ip, 5, 60_000).remaining).toBe(3)
    expect(rateLimit(ip, 5, 60_000).remaining).toBe(2)
    expect(rateLimit(ip, 5, 60_000).remaining).toBe(1)
    expect(rateLimit(ip, 5, 60_000).remaining).toBe(0)
    expect(rateLimit(ip, 5, 60_000).limited).toBe(true)
  })
})
