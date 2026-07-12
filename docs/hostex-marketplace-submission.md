# ListingIQ — Hostex Marketplace Submission

## App Name
ListingIQ

## Category
Listing Optimization

## Website
https://listingiq.pro

## Install URL
https://listingiq.pro/hostex

## Tagline
AI-powered listing audit that scores and rewrites your title, description, photos, and amenities to increase bookings.

## Description

ListingIQ gives Hostex users an instant, AI-powered optimization report for every Airbnb listing in their account — no URL pasting required.

Connect your Hostex account with your API token, pick a listing, and get a scored audit covering:

- Title & Description — readability, keyword density, guest-persona fit, and a fully rewritten version ready to copy-paste
- Photo Analysis — AI scores each photo, recommends keep/retake, picks the best hero shot, and suggests optimal gallery order
- Amenities — competitive gap analysis against top listings in your market
- SEO Keywords — search terms guests actually use, mapped to your listing
- Conversion Tips — prioritized action plan ranked by expected booking impact

Reports are delivered on-screen instantly and can be exported as PDF or emailed for later reference.

## How It Works

1. Go to https://listingiq.pro/hostex
2. Enter your Hostex API token (found in Settings > API)
3. Select a listing from your synced Airbnb properties
4. Choose Quick Score ($29) or Full Audit ($49)
5. Receive your scored optimization report in about 1 minute

## Who It's For

Hosts and property managers who want data-driven guidance on improving their listing presentation — without hiring a copywriter or photographer.

## Pricing

- Quick Score — $29 (text audit: title, description, amenities, SEO, action plan)
- Full Audit — $49 (everything above + AI analysis of up to 10 photos with gallery reorder)

One-time payment per listing. No subscription. No account required.

## Support Contact
Sergei Stadnik
Email: sergeigodev@gmail.com
Messenger: https://m.me/redhiker

## Logo
Attached separately (PNG, transparent background).
Can provide SVG or alternate sizes on request.

---

## Technical / API Details

| Field | Value |
|---|---|
| Authentication | Hostex API Token (header: Hostex-Access-Token) |
| Data access | Read-only — ListingIQ reads listings and reviews only |
| Write-back | Optional — users can push optimized title/description back |
| API version | Hostex API v3 |
| Webhook URL | https://listingiq.pro/api/integrations/hostex/webhook |

### Connection Flow

1. User visits https://listingiq.pro/hostex
2. Enters their Hostex API token
3. ListingIQ validates the token by fetching listings
4. Token is stored securely (encrypted at rest in Supabase)
5. User lands on listing selection screen, ready to analyze

### Data ListingIQ Reads
- Listing metadata (title, description, amenities, photos, location)
- Channel information (Airbnb listing URL)
- Reviews (for sentiment analysis)

### Data ListingIQ Does NOT Access
- No calendar, reservation, or pricing data
- No guest personal information is stored
- No modifications without explicit user action

### Write-Back (Optional)
- Users can push optimized title/description back to Hostex
- Requires explicit user confirmation before any write
- Only updates title and description fields

---

## Screenshot Captions

1. **Connect** — "Enter your Hostex API token to get started"
2. **Listing List** — "All your Airbnb listings in one view — pick any to analyze"
3. **Plan Selection** — "Choose Quick Score ($29) or Full Audit ($49)"
4. **Analyzing** — "AI analysis runs in about 1 minute"
5. **Report: Overall Score** — "Scored optimization report with category-by-category breakdown"
6. **Report: Rewritten Copy** — "AI-rewritten title and description — ready to copy-paste or push back to Hostex"
7. **Report: Photo Analysis** — "Photo-by-photo AI analysis with hero shot recommendation"
