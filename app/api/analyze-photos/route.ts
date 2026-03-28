import Anthropic from '@anthropic-ai/sdk'
import { NextRequest, NextResponse } from 'next/server'
import { verifyPayment } from '@/app/lib/verify-payment'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export interface PhotoVerdict {
  index: number
  filename: string
  verdict: 'keep' | 'retake'
  score: number
  roomType: string
  strengths: string[]
  problems: string[]
  retakeInstructions: string | null
  heroWorthy: boolean
}

export interface PhotoAnalysisResult {
  photos: PhotoVerdict[]
  overallPhotoScore: number
  missingShots: string[]
  heroSuggestion: string
}

const PHOTO_SYSTEM = `You are an expert Airbnb photography consultant. Analyze each photo in the context of the listing it belongs to — consider what the listing promises and whether the photos deliver on that promise.

Return ONLY valid JSON — no markdown, no backticks:
{
  "photos": [
    {
      "index": 0,
      "filename": "photo name",
      "verdict": "keep" | "retake",
      "score": <0-100>,
      "roomType": "classify what room/space is shown",
      "strengths": ["strength 1", "strength 2"],
      "problems": ["problem 1"],
      "retakeInstructions": "Specific instructions if verdict is retake, else null",
      "heroWorthy": true | false
    }
  ],
  "overallPhotoScore": <0-100>,
  "missingShots": ["shot type missing — explain why this matters for the listing"],
  "heroSuggestion": "Which photo should be #1 and why — tie it to the listing's key selling points"
}

HERO SHOTS:
- Mark the best photos as heroWorthy: true. These are the standout images that should appear first in the listing gallery.
- Typically 3-5 photos should be marked as hero shots out of the full set — the ones with the highest quality, best lighting, and strongest emotional appeal.
- Only photos with a "keep" verdict should be marked as hero shots.

Valid roomType values: "living room", "bedroom", "kitchen", "bathroom", "exterior", "hot tub", "garden", "dining", "pool", "workspace", "other"

Scoring criteria:
- Lighting (natural light scores highest)
- Staging (clean, uncluttered, inviting)
- Angle (eye-level or slight elevation works best)
- Emotional appeal (does it make you want to book?)
- Technical quality (sharp, well-exposed)
- Listing alignment (does this photo support what the listing promises?)

For retake instructions be VERY specific and UNIQUE to each photo — never repeat the same instructions across photos:
- Reference what is actually shown in THIS specific photo
- Time of day (golden hour, midday) based on the current lighting issues
- Camera position (stand in doorway, shoot from corner) based on the current angle problems
- Staging advice (remove X, add Y) referencing specific items visible in the photo
- What to emphasize based on what this particular room/space offers
- If you cannot give unique instructions for a photo, set retakeInstructions to null

When listing context is provided, use it to:
- Check if key selling points mentioned in the description have matching photos
- Flag missing photos for amenities the listing highlights
- Prioritize photos that showcase the listing's unique differentiators
- Note if any photos contradict or undermine what the description promises

Focus on which photo should be the cover image (first photo guests see in search results) and give each photo a clear keep/retake verdict.`

const USE_MOCK = process.env.USE_MOCK_API === 'true'

function buildMockResult(filenames: string[]): PhotoAnalysisResult {
  const roomTypes = ['living room', 'bedroom', 'kitchen', 'bathroom', 'exterior', 'garden']

  const mockVariants = [
    { score: 82, verdict: 'keep' as const, strengths: ['Bright natural light from windows', 'Room looks spacious and inviting'], problems: ['Could benefit from a slightly wider angle to show more of the space'], retakeInstructions: null },
    { score: 55, verdict: 'retake' as const, strengths: ['Good subject choice — guests want to see this space'], problems: ['Lighting is too dim — the room looks darker than it probably is', 'Angle makes the space feel smaller than it is'], retakeInstructions: 'Shoot during the day with all curtains and blinds open. Stand in the far corner and shoot at chest height to maximise the sense of space.' },
    { score: 74, verdict: 'keep' as const, strengths: ['Clean and well-presented', 'Warm, welcoming feel'], problems: ['A few personal items visible that could be tidied'], retakeInstructions: null },
    { score: 48, verdict: 'retake' as const, strengths: ['Shows an important space guests care about'], problems: ['Cluttered surfaces distract from the room itself', 'Harsh overhead lighting creates unflattering shadows'], retakeInstructions: 'Clear all surfaces and remove personal items. Turn off overhead lights and use natural light or lamps for a softer look. Shoot from the doorway.' },
    { score: 88, verdict: 'keep' as const, strengths: ['Strong composition with great depth', 'Excellent natural lighting'], problems: ['Minor — consider straightening the horizon slightly'], retakeInstructions: null },
    { score: 62, verdict: 'retake' as const, strengths: ['Captures a unique selling point of the property'], problems: ['Photo is underexposed — details are lost in shadows', 'Composition could be improved with a wider lens'], retakeInstructions: 'Wait for golden hour or turn on all ambient lights. Step further back and shoot from a lower angle to make the space feel more dramatic.' },
  ]

  const photos = filenames.map((name, i) => {
    const variant = mockVariants[i % mockVariants.length]
    return {
      index: i,
      filename: name,
      verdict: variant.verdict,
      score: variant.score,
      roomType: roomTypes[i % roomTypes.length],
      strengths: variant.strengths,
      problems: variant.problems,
      retakeInstructions: variant.retakeInstructions,
      heroWorthy: variant.verdict === 'keep' && variant.score >= 80 && i < 10,
    }
  })

  return {
    overallPhotoScore: 64,
    heroSuggestion: `Photo #${photos.findIndex(p => p.heroWorthy) + 1 || 1} has the strongest composition — consider using it as your cover image for maximum click-through in search results.`,
    missingShots: ['Street / neighborhood context', 'Workspace / desk area', 'Amenity close-ups'],
    photos,
  }
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const files = formData.getAll('photos') as File[]

    if (!files.length) {
      return NextResponse.json({ error: 'No photos provided' }, { status: 400 })
    }

    if (files.length > 10) {
      return NextResponse.json({ error: 'Maximum 10 photos at once' }, { status: 400 })
    }

    // Server-side file validation — don't trust client-side checks
    const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp']
    const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10 MB per file
    for (const file of files) {
      if (!ALLOWED_TYPES.includes(file.type)) {
        return NextResponse.json({ error: `Invalid file type: ${file.type}. Allowed: JPG, PNG, WebP` }, { status: 400 })
      }
      if (file.size > MAX_FILE_SIZE) {
        return NextResponse.json({ error: `File too large (max 10 MB per photo): ${file.name}` }, { status: 400 })
      }
    }

    // Verify payment for non-mock requests
    // TODO: Re-enable payment verification before going live
    // if (!USE_MOCK) {
    //   const sessionId = formData.get('sessionId') as string | null
    //   const payment = await verifyPayment(sessionId)
    //   if (!payment.valid) {
    //     return NextResponse.json({ error: payment.error || 'Payment required' }, { status: 403 })
    //   }
    // }

    // Return mock data when USE_MOCK_API is enabled
    if (USE_MOCK) {
      console.log('[photo-analyze] Using mock response (USE_MOCK_API=true)')
      const filenames = files.map(f => f.name)
      return NextResponse.json(buildMockResult(filenames))
    }

    // Convert files to base64
    const labeledContents: (Anthropic.TextBlockParam | Anthropic.ImageBlockParam)[] = []
    const filenames: string[] = []

    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      const bytes = await file.arrayBuffer()
      const base64 = Buffer.from(bytes).toString('base64')
      const mediaType = (file.type || 'image/jpeg') as 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif'

      labeledContents.push({
        type: 'text',
        text: `[Photo ${i}: ${file.name}]`,
      })
      labeledContents.push({
        type: 'image',
        source: { type: 'base64', media_type: mediaType, data: base64 },
      })
      filenames.push(file.name)
    }

    console.log(`[photo-analyze] Analyzing ${files.length} photos...`)

    let result: PhotoAnalysisResult

    try {
      // Parse listing context if provided
      const contextRaw = formData.get('listingContext')
      let contextText = ''
      if (contextRaw) {
        try {
          const ctx = JSON.parse(contextRaw as string)
          contextText = `\n\nListing context — analyze photos in relation to this listing:
- Summary: ${ctx.title || 'N/A'}
- Key amenities: ${ctx.amenities?.join(', ') || 'N/A'}
- Suggested photo types from text analysis: ${ctx.missingPhotos?.join(', ') || 'N/A'}

Check if the photos support what the listing promises. Flag if key selling points from the description are missing from the photo gallery.`
        } catch {}
      }

      const analyzeMessage = await client.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 4000,
        temperature: 0,
        system: PHOTO_SYSTEM,
        messages: [{
          role: 'user',
          content: [
            ...labeledContents,
            {
              type: 'text',
              text: `Above are ${files.length} Airbnb listing photos. Each is labeled [Photo N: filename].

Evaluate each photo's quality, classify its room type, give a keep/retake verdict, mark the best photos as hero shots, and identify missing shot types.${contextText}`,
            },
          ],
        }],
      })

      const raw = analyzeMessage.content
        .map(b => (b.type === 'text' ? b.text : ''))
        .join('')
        .replace(/```json|```/g, '')
        .trim()

      result = JSON.parse(raw)

      // Patch filenames
      result.photos = result.photos.map((p, i) => ({
        ...p,
        filename: filenames[i] || p.filename,
      }))
    } catch (apiErr) {
      console.warn('[photo-analyze] API call failed, using fallback:', apiErr instanceof Error ? apiErr.message : apiErr)
      result = buildMockResult(filenames)
    }

    return NextResponse.json(result)
  } catch (err) {
    console.error('[photo-analyze]', err)
    return NextResponse.json({ error: 'Photo analysis failed' }, { status: 500 })
  }
}
