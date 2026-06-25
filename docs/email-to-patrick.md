# Email to Patrick — Hospitable Marketplace Submission

Hi Patrick, (and it feels like we have been talking forever!)

Great — let's get ListingIQ on the Marketplace.

I've attached everything you need for the listing:

- Marketplace submission doc — app name, description, features, pricing, technical/OAuth details, and screenshot captions (all in one document)
- Logo (PNG, transparent background — can provide SVG or other sizes if needed)
- 6 screenshots of the full integration flow: connect screen, property list, analysis, scored report, AI-rewritten copy, and photo analysis

The integration is live and working against your Public API v2. We request read-only access (properties:read, reviews:read) — we never write to Hospitable.

Install URL: https://listingiq.pro/hospitable

P.S. — I'm testing the full flow and the OAuth connects successfully, but API calls to /v2/properties return 401 "Unauthenticated." I think this is because the app is still in sandbox mode (not yet marked as Production in the Partners portal). Could you either promote ListingIQ to production, or let me know the sandbox API base URL so I can test in the meantime?

Let me know if you need anything else or if there are changes to the listing before it goes live.

Best,
Sergei Stadnik
