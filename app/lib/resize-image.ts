import sharp from 'sharp'

const MAX_DIMENSION = 768

/**
 * Resize an image buffer so the longest edge is at most MAX_DIMENSION pixels.
 * Returns { buffer, mediaType } with the resized image as a Buffer.
 * Images already within the limit are returned as-is (no re-encoding).
 * Output is always JPEG (best token/quality tradeoff for Claude Vision).
 */
export async function resizeForVision(input: Buffer): Promise<{ buffer: Buffer; mediaType: 'image/jpeg' }> {
  const meta = await sharp(input).metadata()
  const w = meta.width ?? 0
  const h = meta.height ?? 0

  if (w <= MAX_DIMENSION && h <= MAX_DIMENSION) {
    // Already small enough — just convert to JPEG for consistent type
    const out = await sharp(input).jpeg({ quality: 72 }).toBuffer()
    return { buffer: out, mediaType: 'image/jpeg' }
  }

  const out = await sharp(input)
    .resize(MAX_DIMENSION, MAX_DIMENSION, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 72 })
    .toBuffer()

  return { buffer: out, mediaType: 'image/jpeg' }
}
