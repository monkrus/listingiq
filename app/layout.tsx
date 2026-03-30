import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'ListingIQ — Airbnb Listing Analyzer',
  description: 'AI-powered Airbnb listing score and optimization report.',
  openGraph: {
    title: 'ListingIQ — Airbnb Listing Analyzer',
    description: 'AI-powered Airbnb listing score and optimization report.',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'ListingIQ — Airbnb Listing Analyzer',
    description: 'AI-powered Airbnb listing score and optimization report.',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
