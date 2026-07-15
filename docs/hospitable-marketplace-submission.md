# ListingIQ — Hospitable Marketplace Submission

## App Name
ListingIQ

## Category
Listing Optimization

## Website
https://listingiq.pro

## Install URL
https://listingiq.pro/hospitable

## Tagline
AI-powered listing audit that scores and rewrites your title, description, photos, and amenities to increase bookings.

## Description

ListingIQ gives Hospitable users an instant, AI-powered optimization report for every property in their account — no URL pasting required.

Connect your Hospitable account in one click, pick a property, and get a scored audit covering:

- Title & Description — readability, keyword density, guest-persona fit, and a fully rewritten version ready to copy-paste
- Photo Analysis — AI scores each photo, recommends keep/retake, picks the best hero shot, and suggests optimal gallery order
- Amenities — competitive gap analysis against top listings in your market
- SEO Keywords — search terms guests actually use, mapped to your listing
- Conversion Tips — prioritized action plan ranked by expected booking impact

Reports are delivered on-screen instantly and can be exported as PDF or emailed for later reference.

## How It Works

1. Click "Get Started" on the ListingIQ integration page in Hospitable
2. Authorize ListingIQ to read your properties (read-only access)
3. Select a property from your synced list
4. Receive your scored optimization report in about 3 minutes

## Who It's For

Hosts and property managers who want data-driven guidance on improving their listing presentation — without hiring a copywriter or photographer.

## Pricing

- Quick Score — $29 (text audit: title, description, amenities, SEO, action plan)
- Full Audit — $49 (everything above + AI analysis of up to 10 photos with gallery reorder)

One-time payment per property. No subscription. No account required.

## Support Contact
Sergei Stadnik
Email: sergeigodev@gmail.com
Messenger: https://m.me/redhiker

## Logo
Attached separately (PNG, transparent background).
Can provide SVG or alternate sizes on request.

---

## Technical / OAuth Details

| Field | Value |
|---|---|
| OAuth Callback URL | https://listingiq.pro/api/hospitable/callback |
| Scopes | property:read listing:read |
| Data access | Read-only — ListingIQ never writes to Hospitable data |
| API version | Hospitable Public API v2 |
| Token handling | Access tokens auto-refresh via refresh_token grant |
| CSRF protection | Random state nonce in httpOnly cookie, validated on callback |

### OAuth Flow

1. User clicks "Get Started" on the ListingIQ marketplace page in Hospitable
2. Redirected to Hospitable authorization page
3. User logs in and grants access
4. Hospitable redirects to https://listingiq.pro/api/hospitable/callback with authorization code
5. ListingIQ exchanges code for access + refresh tokens
6. User lands on property selection screen, ready to analyze

### Data ListingIQ Reads
- Property list (name, description, amenities, photos, address)
- Connected listing metadata (Airbnb listing ID for URL reconstruction)
- Reviews (when available — used for sentiment analysis)

### Data ListingIQ Does NOT Access
- No writes to any Hospitable data
- No calendar, reservation, or pricing access
- No guest personal information is stored

---

## Screenshot Captions

1. **Connect** — "One-click connection — authorize ListingIQ to read your properties"
2. **Property List** — "All your Hospitable properties in one view — pick any to analyze"
3. **Analyzing** — "AI analysis runs in about 3 minutes"
4. **Report: Overall Score** — "Scored optimization report with category-by-category breakdown"
5. **Report: Rewritten Copy** — "AI-rewritten title and description — ready to copy-paste"
6. **Report: Photo Analysis** — "Photo-by-photo AI analysis with hero shot recommendation"
