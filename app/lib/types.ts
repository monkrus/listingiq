export interface ReportData {
  overallScore: number
  estimatedImprovement: string
  summary: string
  titleScore: number
  titleProblems: string[]
  titleSuggestions: string[]
  descriptionScore: number
  descriptionProblems: string[]
  descriptionRewrite: string
  photoScore: number
  photoCount: number
  missingPhotos: string[]
  amenityScore: number
  topAmenities: string[]
  amenityGaps: string[]
  personaScore: number
  primaryPersona: string
  personaProblems: string[]
  personaSuggestion: string
  reviewScore: number
  guestLoves: string[]
  reviewRisks: string[]
  seoKeywords: string[]
  conversionTips: string[]
  priorityActions: string[]
  competitorInsight: string
  wasScraped?: boolean
}

export interface ListingInput {
  title?: string
  location?: string
  description?: string
  amenities?: string[]
  photoCount?: number
  photoUrls?: string[]
  rating?: number
  reviewCount?: number
  reviews?: string[]
  url?: string
  isDemo?: boolean
}
