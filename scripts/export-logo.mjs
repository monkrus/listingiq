/**
 * Export the ListingIQ logo as PNG in 3 variants:
 *   1. logo-dark.png   — dark text, transparent bg (for light backgrounds)
 *   2. logo-light.png  — light text, transparent bg (for dark backgrounds)
 *   3. logo-white-bg.png — dark text, white bg (universal fallback)
 *
 * Uses Playwright to render with the exact Syne Google Font.
 * Usage: node scripts/export-logo.mjs
 */
import { chromium } from 'playwright'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const outDir = join(__dirname, '..', 'public')

const SIZE = 80
const accentColor = '#2A7B6F'
const accentLight = '#3ECDB5'

function buildHtml(textColor) {
  return `<!DOCTYPE html>
<html>
<head>
  <link href="https://fonts.googleapis.com/css2?family=Syne:wght@700&display=block" rel="stylesheet">
  <style>
    * { margin: 0; padding: 0; }
    body { background: transparent; }
    .logo-wrap {
      display: inline-flex;
      align-items: center;
      gap: ${SIZE * 0.25}px;
      padding: 8px;
    }
  </style>
</head>
<body>
  <div class="logo-wrap" id="logo">
    <svg width="${SIZE}" height="${SIZE}" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="logo-grad" x1="0%" y1="100%" x2="100%" y2="0%">
          <stop offset="0%" stop-color="${accentColor}" />
          <stop offset="100%" stop-color="${accentLight}" />
        </linearGradient>
        <clipPath id="house-clip">
          <path d="M32 6L4 30V58H24V42H40V58H60V30L32 6Z" />
        </clipPath>
      </defs>
      <path d="M32 6L4 30V58H24V42H40V58H60V30L32 6Z"
            fill="url(#logo-grad)" opacity="0.12" />
      <path d="M32 6L4 30V58H24V42H40V58H60V30L32 6Z"
            stroke="url(#logo-grad)" stroke-width="3"
            stroke-linejoin="round" stroke-linecap="round" fill="none" />
      <polyline points="8,46 18,42 26,44 34,32 42,28 50,18 58,12"
               stroke="${accentLight}" stroke-width="2.8"
               stroke-linecap="round" stroke-linejoin="round"
               fill="none" clip-path="url(#house-clip)" />
      <circle cx="8"  cy="46" r="2.6" fill="${accentLight}" clip-path="url(#house-clip)" />
      <circle cx="18" cy="42" r="2.6" fill="${accentLight}" clip-path="url(#house-clip)" />
      <circle cx="26" cy="44" r="2.6" fill="${accentLight}" clip-path="url(#house-clip)" />
      <circle cx="34" cy="32" r="2.6" fill="${accentLight}" clip-path="url(#house-clip)" />
      <circle cx="42" cy="28" r="2.6" fill="${accentLight}" clip-path="url(#house-clip)" />
      <circle cx="50" cy="18" r="2.6" fill="${accentLight}" clip-path="url(#house-clip)" />
      <circle cx="58" cy="12" r="2.6" fill="${accentLight}" clip-path="url(#house-clip)" />
      <circle cx="58" cy="12" r="3.5" fill="${accentLight}" opacity="0.5" />
      <circle cx="58" cy="12" r="2" fill="#fff" />
    </svg>

    <svg height="${SIZE * 0.55}" viewBox="0 0 200 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <text x="0" y="25"
            font-family="'Syne', sans-serif" font-weight="700"
            font-size="28" fill="${textColor}" letter-spacing="-0.5">
        Listing<tspan fill="${accentColor}" font-weight="700">IQ</tspan>
      </text>
    </svg>
  </div>
</body>
</html>`
}

const browser = await chromium.launch()
const page = await browser.newPage({ deviceScaleFactor: 2 })

// 1. Dark text, transparent bg
await page.setContent(buildHtml('#1a1a1a'), { waitUntil: 'networkidle' })
await page.evaluate(() => document.fonts.ready)
await page.locator('#logo').screenshot({
  path: join(outDir, 'logo-dark.png'),
  omitBackground: true,
})
console.log('Saved: logo-dark.png (transparent, for light backgrounds)')

// 2. Light text, transparent bg
await page.setContent(buildHtml('#F7F6F3'), { waitUntil: 'networkidle' })
await page.evaluate(() => document.fonts.ready)
await page.locator('#logo').screenshot({
  path: join(outDir, 'logo-light.png'),
  omitBackground: true,
})
console.log('Saved: logo-light.png (transparent, for dark backgrounds)')

// 3. Dark text, white bg
await page.setContent(buildHtml('#1a1a1a'), { waitUntil: 'networkidle' })
await page.evaluate(() => document.fonts.ready)
await page.locator('#logo').screenshot({
  path: join(outDir, 'logo-white-bg.png'),
  omitBackground: false,
})
console.log('Saved: logo-white-bg.png (white background, universal)')

// 4. Square icon only (white bg) — for app integrations
const ICON_SIZE = 256
const iconHtml = `<!DOCTYPE html>
<html>
<head>
  <style>
    * { margin: 0; padding: 0; }
    body { background: white; }
    .icon-wrap {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: ${ICON_SIZE}px;
      height: ${ICON_SIZE}px;
    }
  </style>
</head>
<body>
  <div class="icon-wrap" id="icon">
    <svg width="${ICON_SIZE * 0.75}" height="${ICON_SIZE * 0.75}" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="logo-grad" x1="0%" y1="100%" x2="100%" y2="0%">
          <stop offset="0%" stop-color="${accentColor}" />
          <stop offset="100%" stop-color="${accentLight}" />
        </linearGradient>
        <clipPath id="house-clip">
          <path d="M32 6L4 30V58H24V42H40V58H60V30L32 6Z" />
        </clipPath>
      </defs>
      <path d="M32 6L4 30V58H24V42H40V58H60V30L32 6Z"
            fill="url(#logo-grad)" opacity="0.12" />
      <path d="M32 6L4 30V58H24V42H40V58H60V30L32 6Z"
            stroke="url(#logo-grad)" stroke-width="3"
            stroke-linejoin="round" stroke-linecap="round" fill="none" />
      <polyline points="8,46 18,42 26,44 34,32 42,28 50,18 58,12"
               stroke="${accentLight}" stroke-width="2.8"
               stroke-linecap="round" stroke-linejoin="round"
               fill="none" clip-path="url(#house-clip)" />
      <circle cx="8"  cy="46" r="2.6" fill="${accentLight}" clip-path="url(#house-clip)" />
      <circle cx="18" cy="42" r="2.6" fill="${accentLight}" clip-path="url(#house-clip)" />
      <circle cx="26" cy="44" r="2.6" fill="${accentLight}" clip-path="url(#house-clip)" />
      <circle cx="34" cy="32" r="2.6" fill="${accentLight}" clip-path="url(#house-clip)" />
      <circle cx="42" cy="28" r="2.6" fill="${accentLight}" clip-path="url(#house-clip)" />
      <circle cx="50" cy="18" r="2.6" fill="${accentLight}" clip-path="url(#house-clip)" />
      <circle cx="58" cy="12" r="2.6" fill="${accentLight}" clip-path="url(#house-clip)" />
      <circle cx="58" cy="12" r="3.5" fill="${accentLight}" opacity="0.5" />
      <circle cx="58" cy="12" r="2" fill="#fff" />
    </svg>
  </div>
</body>
</html>`

await page.setContent(iconHtml, { waitUntil: 'load' })
await page.locator('#icon').screenshot({
  path: join(outDir, 'logo-icon.png'),
  omitBackground: false,
})
console.log('Saved: logo-icon.png (square 512x512, white bg, icon only)')

await browser.close()
