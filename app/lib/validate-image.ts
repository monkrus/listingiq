/**
 * Validate image files by checking magic bytes (file signatures).
 * Prevents file type spoofing via client-controlled Content-Type headers.
 */

const SIGNATURES: { type: string; bytes: number[]; offset?: number }[] = [
  // JPEG: FF D8 FF
  { type: 'image/jpeg', bytes: [0xFF, 0xD8, 0xFF] },
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  { type: 'image/png', bytes: [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A] },
  // WebP: RIFF....WEBP (bytes 0-3 = RIFF, bytes 8-11 = WEBP)
  { type: 'image/webp', bytes: [0x52, 0x49, 0x46, 0x46] },
]

const WEBP_MARKER = [0x57, 0x45, 0x42, 0x50] // "WEBP" at offset 8

/**
 * Check if a buffer contains a valid image by inspecting magic bytes.
 * Returns the detected MIME type or null if not a recognized image.
 */
export function detectImageType(buffer: ArrayBuffer): string | null {
  const bytes = new Uint8Array(buffer)
  if (bytes.length < 12) return null

  for (const sig of SIGNATURES) {
    const match = sig.bytes.every((b, i) => bytes[(sig.offset ?? 0) + i] === b)
    if (!match) continue

    // WebP needs additional check at offset 8
    if (sig.type === 'image/webp') {
      const webpMatch = WEBP_MARKER.every((b, i) => bytes[8 + i] === b)
      if (!webpMatch) continue
    }

    return sig.type
  }

  return null
}

/**
 * Validate that a File is a genuine image (not just spoofed Content-Type).
 * Returns the real MIME type or throws with a descriptive message.
 */
export async function validateImageFile(file: File): Promise<string> {
  const buffer = await file.arrayBuffer()
  const realType = detectImageType(buffer)

  if (!realType) {
    throw new Error(`${file.name} is not a valid image. Allowed: JPG, PNG, WebP`)
  }

  return realType
}

/**
 * Validate a base64-encoded image from the photo store.
 * Returns the real MIME type or null.
 */
export function validateBase64Image(base64: string): string | null {
  const binary = Buffer.from(base64, 'base64')
  return detectImageType(binary.buffer.slice(binary.byteOffset, binary.byteOffset + binary.byteLength))
}
