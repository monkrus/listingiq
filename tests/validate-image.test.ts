import { describe, it, expect } from 'vitest'
import { detectImageType, validateBase64Image } from '@/app/lib/validate-image'

// Real magic byte headers for each format
function jpegBuffer(): ArrayBuffer {
  const arr = new Uint8Array(16)
  arr[0] = 0xFF; arr[1] = 0xD8; arr[2] = 0xFF; arr[3] = 0xE0
  return arr.buffer
}

function pngBuffer(): ArrayBuffer {
  const arr = new Uint8Array(16)
  const sig = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]
  sig.forEach((b, i) => arr[i] = b)
  return arr.buffer
}

function webpBuffer(): ArrayBuffer {
  const arr = new Uint8Array(16)
  // RIFF at 0-3
  const riff = [0x52, 0x49, 0x46, 0x46]
  riff.forEach((b, i) => arr[i] = b)
  // Size bytes 4-7 (don't matter for detection)
  // WEBP at 8-11
  const webp = [0x57, 0x45, 0x42, 0x50]
  webp.forEach((b, i) => arr[8 + i] = b)
  return arr.buffer
}

describe('detectImageType', () => {
  it('detects JPEG from magic bytes', () => {
    expect(detectImageType(jpegBuffer())).toBe('image/jpeg')
  })

  it('detects PNG from magic bytes', () => {
    expect(detectImageType(pngBuffer())).toBe('image/png')
  })

  it('detects WebP from RIFF+WEBP markers', () => {
    expect(detectImageType(webpBuffer())).toBe('image/webp')
  })

  it('rejects RIFF without WEBP marker (e.g. AVI)', () => {
    const arr = new Uint8Array(16)
    const riff = [0x52, 0x49, 0x46, 0x46]
    riff.forEach((b, i) => arr[i] = b)
    // AVI marker instead of WEBP
    const avi = [0x41, 0x56, 0x49, 0x20]
    avi.forEach((b, i) => arr[8 + i] = b)
    expect(detectImageType(arr.buffer)).toBeNull()
  })

  it('returns null for empty buffer', () => {
    expect(detectImageType(new ArrayBuffer(0))).toBeNull()
  })

  it('returns null for buffer too short', () => {
    expect(detectImageType(new ArrayBuffer(4))).toBeNull()
  })

  it('returns null for plain text', () => {
    const text = new TextEncoder().encode('Hello, world! This is not an image file at all.')
    expect(detectImageType(text.buffer)).toBeNull()
  })

  it('returns null for random bytes', () => {
    const arr = new Uint8Array(64)
    arr.forEach((_, i) => arr[i] = Math.floor(Math.random() * 256))
    arr[0] = 0x00 // ensure it doesn't accidentally start with FF D8 FF
    expect(detectImageType(arr.buffer)).toBeNull()
  })

  it('returns null for PDF magic bytes', () => {
    const pdf = new TextEncoder().encode('%PDF-1.4 rest of file...')
    expect(detectImageType(pdf.buffer)).toBeNull()
  })

  it('returns null for ZIP magic bytes', () => {
    const arr = new Uint8Array(16)
    arr[0] = 0x50; arr[1] = 0x4B; arr[2] = 0x03; arr[3] = 0x04
    expect(detectImageType(arr.buffer)).toBeNull()
  })
})

describe('validateBase64Image', () => {
  it('validates base64-encoded JPEG', () => {
    const base64 = Buffer.from(new Uint8Array(jpegBuffer())).toString('base64')
    expect(validateBase64Image(base64)).toBe('image/jpeg')
  })

  it('validates base64-encoded PNG', () => {
    const base64 = Buffer.from(new Uint8Array(pngBuffer())).toString('base64')
    expect(validateBase64Image(base64)).toBe('image/png')
  })

  it('rejects invalid base64 image', () => {
    const base64 = Buffer.from('not an image at all').toString('base64')
    expect(validateBase64Image(base64)).toBeNull()
  })

  it('rejects empty base64', () => {
    expect(validateBase64Image('')).toBeNull()
  })
})
