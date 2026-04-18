import { NextRequest, NextResponse } from 'next/server'
import { rateLimit } from '@/app/lib/rate-limit'
import { checkOrigin } from '@/app/lib/check-origin'
import { storePhotos } from '@/app/lib/photo-store'
import { validateImageFile } from '@/app/lib/validate-image'

export async function POST(req: NextRequest) {
  try {
    const originBlock = checkOrigin(req)
    if (originBlock) return originBlock

    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
    const { limited } = rateLimit(ip, 5, 60_000)
    if (limited) {
      return NextResponse.json({ error: 'Too many requests. Please wait a minute.' }, { status: 429 })
    }

    const formData = await req.formData()
    const files = formData.getAll('photos') as File[]

    if (!files.length) {
      return NextResponse.json({ error: 'No photos provided' }, { status: 400 })
    }
    if (files.length > 10) {
      return NextResponse.json({ error: 'Maximum 10 photos' }, { status: 400 })
    }

    const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp']
    const MAX_FILE_SIZE = 4 * 1024 * 1024
    const MAX_TOTAL_SIZE = 20 * 1024 * 1024
    let totalSize = 0

    for (const file of files) {
      if (file.size > MAX_FILE_SIZE) {
        return NextResponse.json({ error: `${file.name} is too large (max 4 MB per photo).` }, { status: 400 })
      }
      totalSize += file.size
    }
    if (totalSize > MAX_TOTAL_SIZE) {
      return NextResponse.json({ error: 'Total upload size exceeds 20 MB.' }, { status: 400 })
    }

    // Validate magic bytes and convert to base64
    const photos = await Promise.all(files.map(async (file) => {
      let realType: string
      try {
        realType = await validateImageFile(file)
      } catch (err) {
        throw new Error(err instanceof Error ? err.message : `${file.name} is not a valid image`)
      }
      const bytes = await file.arrayBuffer()
      return {
        base64: Buffer.from(bytes).toString('base64'),
        mediaType: realType,
        filename: file.name,
      }
    }))

    const uploadId = crypto.randomUUID()
    const stored = storePhotos(uploadId, photos)
    if (!stored) {
      return NextResponse.json({ error: 'Server is busy. Please try again in a few minutes.' }, { status: 503 })
    }

    return NextResponse.json({ uploadId, photoCount: photos.length })
  } catch (err) {
    console.error('[upload-photos]', err)
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 })
  }
}
