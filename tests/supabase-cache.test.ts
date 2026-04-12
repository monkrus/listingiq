/**
 * Tests for Supabase cache functions (cacheReport, getCachedReportBySession, updateCachedPhotos).
 * Mocks the Supabase client to verify correct query construction.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Build a chainable query mock that records calls
function chainMock(result: { data?: any; error?: any }) {
  const chain: any = {
    _calls: [] as string[],
    from: vi.fn(function (this: any, table: string) { this._calls.push(`from:${table}`); return this }),
    select: vi.fn(function (this: any) { this._calls.push('select'); return this }),
    insert: vi.fn(function (this: any) { this._calls.push('insert'); return this }),
    upsert: vi.fn(function (this: any, _row: any, opts?: any) { chain._upsertOpts = opts; this._calls.push('upsert'); return this }),
    update: vi.fn(function (this: any) { this._calls.push('update'); return this }),
    eq: vi.fn(function (this: any) { this._calls.push('eq'); return this }),
    single: vi.fn(function (this: any) { this._calls.push('single'); return result }),
    rpc: vi.fn().mockResolvedValue({}),
  }
  // Make non-terminal methods also resolve for chains that end without single()
  chain.from.mockReturnValue(chain)
  chain.select.mockReturnValue(chain)
  chain.insert.mockReturnValue(chain)
  chain.upsert.mockImplementation((_row: any, opts?: any) => { chain._upsertOpts = opts; return { ...result, select: () => result } })
  chain.update.mockReturnValue(chain)
  chain.eq.mockReturnValue(chain)

  // For upsert that returns { error } directly
  return chain
}

const mockDb = chainMock({ data: null, error: null })

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => mockDb),
}))

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://test.supabase.co')
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-key')
})

describe('cacheReport', () => {
  it('uses upsert with onConflict: session_id', async () => {
    // Re-import to pick up env
    const mod = await import('@/app/lib/supabase')
    // We need getSupabaseAdmin to return our mock
    // Since env is set, it will try to create a real client — our mock handles it
    const upsertResult = { error: null }
    mockDb.from.mockReturnValue(mockDb)
    mockDb.upsert.mockReturnValue(upsertResult)

    const result = await mod.cacheReport('cs_test', 'full-audit', 'https://airbnb.com/rooms/1', { score: 72 })

    expect(mockDb.from).toHaveBeenCalledWith('cached_reports')
    expect(mockDb.upsert).toHaveBeenCalled()
    // Verify onConflict is set
    const upsertCall = mockDb.upsert.mock.calls[0]
    expect(upsertCall[1]).toEqual({ onConflict: 'session_id' })
  })

  it('does not include photo fields when not provided', async () => {
    mockDb.from.mockReturnValue(mockDb)
    mockDb.upsert.mockReturnValue({ error: null })

    const mod = await import('@/app/lib/supabase')
    await mod.cacheReport('cs_no_photos', 'quick-score', 'https://airbnb.com/rooms/2', { score: 80 })

    const row = mockDb.upsert.mock.calls[0][0]
    expect(row).not.toHaveProperty('photo_results')
    expect(row).not.toHaveProperty('photo_previews')
  })

  it('includes photo fields when provided', async () => {
    mockDb.from.mockReturnValue(mockDb)
    mockDb.upsert.mockReturnValue({ error: null })

    const mod = await import('@/app/lib/supabase')
    const photos = { photos: [{ score: 85 }] }
    const previews = ['data:image/jpeg;base64,abc']
    await mod.cacheReport('cs_with_photos', 'full-audit', 'https://airbnb.com/rooms/3', { score: 70 }, photos, previews)

    const row = mockDb.upsert.mock.calls[0][0]
    expect(row.photo_results).toEqual(photos)
    expect(row.photo_previews).toEqual(previews)
  })

  it('returns false on upsert error', async () => {
    mockDb.from.mockReturnValue(mockDb)
    mockDb.upsert.mockReturnValue({ error: { message: 'constraint violation' } })

    const mod = await import('@/app/lib/supabase')
    const result = await mod.cacheReport('cs_fail', 'quick-score', 'url', {})
    expect(result).toBe(false)
  })
})

describe('updateCachedPhotos', () => {
  it('uses update (not upsert) to prevent NOT NULL violations', async () => {
    mockDb.from.mockReturnValue(mockDb)
    mockDb.update.mockReturnValue(mockDb)
    mockDb.eq.mockReturnValue(mockDb)
    mockDb.select.mockReturnValue({ data: [{ session_id: 'cs_update' }], error: null })

    const mod = await import('@/app/lib/supabase')
    const result = await mod.updateCachedPhotos('cs_update', { photos: [] })
    expect(result).toBe(true)
    expect(mockDb.update).toHaveBeenCalled()
    // Should NOT have called upsert
    expect(mockDb.upsert).not.toHaveBeenCalled()
  })

  it('returns false when no row exists (update matched 0 rows)', async () => {
    mockDb.from.mockReturnValue(mockDb)
    mockDb.update.mockReturnValue(mockDb)
    mockDb.eq.mockReturnValue(mockDb)
    mockDb.select.mockReturnValue({ data: [], error: null })

    const mod = await import('@/app/lib/supabase')
    const result = await mod.updateCachedPhotos('cs_missing', { photos: [] })
    expect(result).toBe(false)
  })

  it('returns false on database error', async () => {
    mockDb.from.mockReturnValue(mockDb)
    mockDb.update.mockReturnValue(mockDb)
    mockDb.eq.mockReturnValue(mockDb)
    mockDb.select.mockReturnValue({ data: null, error: { message: 'db error' } })

    const mod = await import('@/app/lib/supabase')
    const result = await mod.updateCachedPhotos('cs_error', { photos: [] })
    expect(result).toBe(false)
  })
})

describe('getCachedReportBySession', () => {
  it('returns formatted data on cache hit', async () => {
    mockDb.from.mockReturnValue(mockDb)
    mockDb.select.mockReturnValue(mockDb)
    mockDb.eq.mockReturnValue(mockDb)
    mockDb.single.mockReturnValue({
      data: {
        plan: 'full-audit',
        listing_url: 'https://airbnb.com/rooms/5',
        report_data: { overallScore: 72 },
        photo_results: { photos: [] },
        photo_previews: ['data:image/jpeg;base64,x'],
      },
      error: null,
    })

    const mod = await import('@/app/lib/supabase')
    const result = await mod.getCachedReportBySession('cs_hit')
    expect(result).not.toBeNull()
    expect(result!.plan).toBe('full-audit')
    expect(result!.reportData).toEqual({ overallScore: 72 })
    expect(result!.photoResults).toEqual({ photos: [] })
  })

  it('returns null on cache miss', async () => {
    mockDb.from.mockReturnValue(mockDb)
    mockDb.select.mockReturnValue(mockDb)
    mockDb.eq.mockReturnValue(mockDb)
    mockDb.single.mockReturnValue({ data: null, error: { code: 'PGRST116' } })

    const mod = await import('@/app/lib/supabase')
    const result = await mod.getCachedReportBySession('cs_miss')
    expect(result).toBeNull()
  })
})
