import { NextRequest, NextResponse } from 'next/server'
import { rateLimit } from '@/app/lib/rate-limit'
import { checkOrigin } from '@/app/lib/check-origin'
import { storePhotos } from '@/app/lib/photo-store'
import { validateImageFile, validateBase64Image } from '@/app/lib/validate-image'

export const runtime = 'nodejs'

interface UploadPhoto {
  base64: string
  filename: string
}

export async function POST(req: NextRequest) {
  try {
    const originBlock = checkOrigin(req)
    if (originBlock) return originBlock

    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
    const { limited } = rateLimit(ip, 5, 60_000)
    if (limited) {
      return NextResponse.json({ error: 'Too many requests. Please wait a minute.' }, { status: 429 })
    }

    const contentType = req.headers.get('content-type') || ''

    // Accept both JSON (new client) and FormData (cached client)
    if (contentType.includes('application/json')) {
      return handleJsonUpload(req)
    } else {
      return handleFormDataUpload(req)
    }
  } catch (err) {
    console.error('[upload-photos]', err)
    const message = err instanceof Error ? err.message : 'Upload failed'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}

async function handleJsonUpload(req: NextRequest) {
  const body = await req.json() as { photos?: UploadPhoto[] }
  const items = body.photos

  if (!items?.length) {
    return NextResponse.json({ error: 'No photos provided' }, { status: 400 })
  }
  if (items.length > 10) {
    return NextResponse.json({ error: 'Maximum 10 photos' }, { status: 400 })
  }

  const MAX_BASE64_SIZE = 6 * 1024 * 1024
  const MAX_TOTAL_BASE64 = 30 * 1024 * 1024
  let totalSize = 0

  const photos = items.map((item) => {
    if (!item.base64 || typeof item.base64 !== 'string') {
      throw new Error('Invalid photo data')
    }
    if (item.base64.length > MAX_BASE64_SIZE) {
      throw new Error(`${item.filename || 'Photo'} is too large (max 4 MB per photo).`)
    }
    totalSize += item.base64.length
    if (totalSize > MAX_TOTAL_BASE64) {
      throw new Error('Total upload size exceeds 20 MB.')
    }

    const realType = validateBase64Image(item.base64)
    if (!realType) {
      throw new Error(`${item.filename || 'Photo'} is not a valid image. Allowed: JPG, PNG, WebP`)
    }

    return {
      base64: item.base64,
      mediaType: realType,
      filename: item.filename || 'photo.jpg',
    }
  })

  const uploadId = crypto.randomUUID()
  const stored = storePhotos(uploadId, photos)
  if (!stored) {
    return NextResponse.json({ error: 'Server is busy. Please try again in a few minutes.' }, { status: 503 })
  }

  return NextResponse.json({ uploadId, photoCount: photos.length })
}

async function handleFormDataUpload(req: NextRequest) {
  const formData = await req.formData()
  const files = formData.getAll('photos') as File[]

  if (!files.length) {
    return NextResponse.json({ error: 'No photos provided' }, { status: 400 })
  }
  if (files.length > 10) {
    return NextResponse.json({ error: 'Maximum 10 photos' }, { status: 400 })
  }

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
}
