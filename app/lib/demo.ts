import { ListingInput } from './types'
import { PhotoAnalysisResult } from '@/app/api/analyze-photos/route'

export const DEMO_LISTING: ListingInput = {
  title: 'Cozy Apartment in City Centre • Walk to Everything',
  location: 'Austin, Texas, US',
  description:
    'Welcome to our place! Great apartment in the heart of the city. Walking distance to restaurants and shops. Has everything you need for a comfortable stay. Clean and well-maintained.',
  amenities: ['Wi-Fi', 'Air conditioning', 'Full kitchen', 'Washer/dryer', 'Smart TV', 'Street parking', 'Coffee maker', '1 bedroom'],
  photoCount: 11,
  rating: 4.5,
  reviewCount: 24,
  reviews: [
    'Great location, close to everything.',
    'Very clean and comfortable.',
    'The kitchen was well stocked.',
    'A bit noisy at night from the street.',
    'Host was super responsive.',
    'Would definitely stay again.',
  ],
  isDemo: true,
}

// --- Demo photo analysis data ---

export const DEMO_PHOTO_PREVIEWS: string[] = [
  '/demo/exterior.jpg',
  '/demo/living-room.jpg',
  '/demo/kitchen.jpg',
  '/demo/bedroom.jpg',
  '/demo/bathroom.jpg',
  '/demo/patio.jpg',
]

export const DEMO_PHOTO_RESULT: PhotoAnalysisResult = {
  overallPhotoScore: 64,
  heroSuggestion: 'Photo #1 (exterior) should remain your hero — it has strong curb appeal, but reshoot at golden hour for warmer tones.',
  missingShots: ['Street / neighborhood context', 'Workspace / desk area', 'Amenity close-ups (coffee maker, smart TV)'],
  suggestedOrder: [0, 2, 1, 5],
  photos: [
    {
      index: 0,
      filename: 'front-exterior.jpg',
      verdict: 'keep',
      score: 82,
      roomType: 'exterior',
      strengths: ['Good curb appeal with visible entrance', 'Clean landscaping frames the shot'],
      problems: ['Harsh midday lighting creates strong shadows'],
      retakeInstructions: null,
      heroWorthy: true,
    },
    {
      index: 1,
      filename: 'living-room.jpg',
      verdict: 'keep',
      score: 71,
      roomType: 'living room',
      strengths: ['Spacious feel, good staging', 'Natural light from windows'],
      problems: ['TV glare distracts from the space', 'Slight clutter on coffee table'],
      retakeInstructions: null,
      heroWorthy: false,
    },
    {
      index: 2,
      filename: 'kitchen.jpg',
      verdict: 'keep',
      score: 76,
      roomType: 'kitchen',
      strengths: ['Clean countertops look inviting', 'Good overhead lighting'],
      problems: ['Dishes visible in the sink'],
      retakeInstructions: null,
      heroWorthy: false,
    },
    {
      index: 3,
      filename: 'bedroom.jpg',
      verdict: 'retake',
      score: 42,
      roomType: 'bedroom',
      strengths: ['Bed is nicely made with white linens'],
      problems: ['Room is very dark — blinds are closed', 'Shot from awkward angle makes room look small', 'Laundry basket visible in corner'],
      retakeInstructions: 'Open all blinds and turn on lamps. Stand in the doorway and shoot at chest height toward the window so natural light illuminates the bed. Remove the laundry basket and any personal items. Add two accent pillows for a hotel-like feel.',
      heroWorthy: false,
    },
    {
      index: 4,
      filename: 'bathroom.jpg',
      verdict: 'retake',
      score: 38,
      roomType: 'bathroom',
      strengths: ['Tile work is modern and appealing'],
      problems: ['Mirror selfie of photographer visible', 'Toiletries cluttering the counter', 'Yellow overhead lighting looks dingy'],
      retakeInstructions: 'Remove all personal toiletries. Place a single folded white towel and a small plant on the counter. Shoot from the doorway angled toward the shower/tub to avoid mirror reflections. Use the room light plus the hallway light for more balanced brightness.',
      heroWorthy: false,
    },
    {
      index: 5,
      filename: 'patio.jpg',
      verdict: 'keep',
      score: 68,
      roomType: 'garden',
      strengths: ['Outdoor seating looks relaxing', 'Greenery adds warmth'],
      problems: ['Slightly overexposed sky washes out the background'],
      retakeInstructions: null,
      heroWorthy: false,
    },
  ],
}
