import { ListingInput, ReportData } from './types'
import { PhotoAnalysisResult } from '@/app/api/analyze-photos/route'
import { estimateImprovement } from './estimate-improvement'

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

// --- Demo report data (matches MOCK_REPORT in analyze/route.ts) ---

const DEMO_OVERALL = 72

export const DEMO_REPORT: ReportData = {
  overallScore: DEMO_OVERALL,
  estimatedImprovement: estimateImprovement(DEMO_OVERALL),
  summary: 'A strong NEC/CBS niche listing with a killer unique selling point (hot tub) but held back by a thin description and missed business-traveller amenities.',
  priorityActions: [
    'Rewrite your description — it reads like a feature list. Paint the guest experience: arriving after a long NEC day, sinking into the hot tub, cooking dinner in the kitchen. Use the full rewrite below.',
    'Add a dedicated workspace mention — you target business travellers and contractors but don\'t mention desk space, fast Wi-Fi speed, or charging points.',
    'Add self check-in with a key safe or smart lock — contractors and event visitors often arrive at odd hours and this is expected for entire-home listings.',
    'Add a "What\'s Nearby" section with your exact drive times to NEC, CBS Arena, Birmingham Airport, and local pubs/restaurants.',
    'Weave both guest personas into your description naturally — mention what business guests care about (Wi-Fi speed, desk, parking, NEC distance) alongside what couples want (hot tub, local restaurants, Warwick Castle) so each type sees themselves.',
  ],
  titleScore: 71,
  titleProblems: [
    'Title front-loads "Hot Tub House" which is great, but the pipe and bullet separators (| •) look cluttered on mobile and get cut off in search results',
    '"Events" is too vague — guests searching don\'t type "events", they type "NEC exhibition" or "CBS Arena concert"',
    'Adding "Entire House" to the title helps guests instantly see it matches their search — it improves click-through when they\'re filtering by property type',
  ],
  titleSuggestions: [
    'Hot Tub House · NEC & CBS Arena · Parking',
    'Private Hot Tub · Near NEC · Sleeps 5',
    'NEC Hot Tub House · 3 Free Parking',
  ],
  descriptionScore: 52,
  descriptionProblems: [
    'Description reads like a bullet-point feature list rather than painting a picture of the guest experience — it doesn\'t sell the feeling of staying here',
    'No mention of specific distances or drive times to NEC, CBS Arena, or Birmingham Airport — these are the main reasons guests book',
    'Rooms described as "small" — this plants doubt. Reframe as "cosy" or just describe what\'s in them without the size qualifier',
  ],
  descriptionRewrite:
    'Your own private house with a hot tub — the perfect home base near the NEC.\n\nAfter a long day at the NEC Exhibition Centre or CBS Arena, unwind in your private hot tub before settling in for the evening. This is a whole house to yourself in Warwickshire — just [X min] from the NEC and [X min] from Birmingham Airport.\n\nThe house sleeps 5 across two cosy double bedrooms and a single room — ideal for a couple\'s getaway, a solo business trip, or a small contractor team. The fully equipped kitchen means you can cook dinner instead of hunting for restaurants after a tiring day, and the lounge is a proper space to relax with the TV.\n\nParking is never a problem — the driveway fits 3 cars, so you and your colleagues can all drive separately. The M6 motorway is [X min] away, making Coventry, Leamington Spa, and Warwick all within easy reach.\n\nWhether you\'re here for a trade show, a concert at the CBS Arena, or simply want a relaxing break in the Warwickshire countryside, this house gives you space, privacy, and comfort.\n\nWe\'d love to host you — check out our reviews and get in touch if you have any questions!',
  photoScore: 38,
  photoCount: 8,
  missingPhotos: [
    'Hero shot of key selling point (e.g. hot tub, garden) with evening lighting for atmosphere',
    'Individual bedroom photos with clean bedding and natural light',
    'Kitchen detail shot showing equipment and worktop space',
    'Outdoor area or garden — guests look for usable outdoor space',
    'Parking area or street view — business travellers want to confirm parking before booking',
  ],
  amenityScore: 62,
  topAmenities: ['Private hot tub', 'Free parking (3 cars)', 'Full kitchen'],
  amenityGaps: ['Self check-in / key safe or smart lock', 'Dedicated workspace or desk for contractors', 'Wi-Fi speed listed in Mbps (business travellers check this)'],
  personaScore: 68,
  primaryPersona: 'Event visitors attending NEC exhibitions and CBS Arena shows',
  personaProblems: [
    'Listing mentions contractors but doesn\'t highlight contractor-friendly amenities — washing machine, early check-in flexibility, or weekly discounts for longer stays',
    'Couples are mentioned but the listing doesn\'t lean into the romantic hot tub angle — no mention of local restaurants, pubs, or date-night spots nearby',
  ],
  personaSuggestion: 'Weave both personas into your description naturally: mention what business guests need (Wi-Fi speed, workspace, parking, NEC distance) alongside what couples want (hot tub, local restaurants, Warwick Castle). One flowing narrative that speaks to multiple audiences works better than rigidly labelled sections.',
  competitorInsight: 'Top-performing listings near event venues typically include exact drive times in their first description line and offer self check-in as standard. A private hot tub is a strong differentiator — to maximise it, consider mentioning specific events by name (e.g. "Great base for Crufts, Spring Fair, or Motorcycle Live") as guests searching for these events may find your listing more relevant.',
  reviewScore: 92,
  guestLoves: ['Hot tub experience', 'Proximity to NEC/CBS Arena', 'Clean and well-maintained'],
  reviewRisks: [
    'Based on available reviews: maintaining a high rating is critical for search ranking — consider a printed guest guide to pre-empt common questions and protect your score.',
    'Ensure the listing clearly explains room sizes and capacity upfront to avoid expectation mismatch in future reviews.',
  ],
  seoKeywords: ['NEC Airbnb with hot tub', 'hot tub house near NEC Birmingham', 'CBS Arena accommodation', 'Warwickshire hot tub rental', 'NEC exhibition accommodation', 'Birmingham Airport Airbnb', 'contractor accommodation near NEC'],
  conversionTips: [
    'Add your best 5-star review quote to the very first line of your description — social proof in the opening line builds instant trust',
    'Offer a 10-15% weekly discount to capture contractor stays of 5+ days — this market is price-sensitive but books longer',
    'Mention specific NEC events in your description (Crufts, Spring Fair, Motorcycle Live) — guests attending these events may find your listing more relevant when browsing',
    'Add exact drive times to key venues: NEC, CBS Arena, Birmingham Airport, nearest motorway junction — guests want to plan their journey before booking',
    'Lead your description with your strongest differentiator (the hot tub) — it\'s what sets you apart and should hook guests in the first line',
  ],
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
