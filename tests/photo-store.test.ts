import { describe, it, expect } from 'vitest'
import { storePhotos, getPhotos, deletePhotos } from '@/app/lib/photo-store'

describe('photoStore', () => {
  it('stores and retrieves photos', () => {
    const photos = [
      { base64: 'abc123', mediaType: 'image/jpeg', filename: 'photo1.jpg' },
      { base64: 'def456', mediaType: 'image/png', filename: 'photo2.png' },
    ]
    storePhotos('test-upload-1', photos)
    const retrieved = getPhotos('test-upload-1')
    expect(retrieved).toEqual(photos)
    expect(retrieved).toHaveLength(2)
  })

  it('returns null for nonexistent upload ID', () => {
    expect(getPhotos('nonexistent-id')).toBeNull()
  })

  it('deletes photos', () => {
    storePhotos('test-delete-1', [{ base64: 'x', mediaType: 'image/jpeg', filename: 'x.jpg' }])
    expect(getPhotos('test-delete-1')).not.toBeNull()
    deletePhotos('test-delete-1')
    expect(getPhotos('test-delete-1')).toBeNull()
  })

  it('rejects when max entries exceeded', () => {
    // Store 50 entries (the limit)
    for (let i = 0; i < 50; i++) {
      storePhotos(`max-test-${i}`, [{ base64: 'x', mediaType: 'image/jpeg', filename: 'x.jpg' }])
    }
    // 51st should be rejected
    const result = storePhotos('max-test-overflow', [{ base64: 'x', mediaType: 'image/jpeg', filename: 'x.jpg' }])
    expect(result).toBe(false)

    // Cleanup
    for (let i = 0; i < 50; i++) {
      deletePhotos(`max-test-${i}`)
    }
  })
})
