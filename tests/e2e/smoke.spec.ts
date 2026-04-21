import { test, expect } from '@playwright/test'

// ─── Landing Page ───────────────────────────────────────────

test('landing page loads and shows main heading', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('h1').first()).toBeVisible()
  await expect(page.locator('h1').first()).toContainText('Score & optimize')
})

test('landing page shows URL input and analyze button', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByPlaceholder('https://airbnb.com/rooms/...')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Analyze' })).toBeVisible()
})

test('landing page shows demo link', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('button', { name: 'Try demo' })).toBeVisible()
})

test('landing page shows feature chips', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByText('Title optimization')).toBeVisible()
  await expect(page.getByText('Photo strategy')).toBeVisible()
  await expect(page.getByText('SEO keywords')).toBeVisible()
  await expect(page.getByText('Conversion tips')).toBeVisible()
})

test('landing page shows version number', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('text=/^v\\d+\\.\\d+/')).toBeVisible()
})

// ─── URL Validation ─────────────────────────────────────────

test('shows error for empty URL', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Analyze' }).click()
  await expect(page.getByText('Please enter an Airbnb listing URL.')).toBeVisible()
})

test('shows error for invalid URL', async ({ page }) => {
  await page.goto('/')
  await page.getByPlaceholder('https://airbnb.com/rooms/...').fill('https://example.com')
  await page.getByRole('button', { name: 'Analyze' }).click()
  await expect(page.getByText('Please enter a valid Airbnb listing URL')).toBeVisible()
})

test('shows error for HTTP URL (not HTTPS)', async ({ page }) => {
  await page.goto('/')
  await page.getByPlaceholder('https://airbnb.com/rooms/...').fill('http://airbnb.com/rooms/12345')
  await page.getByRole('button', { name: 'Analyze' }).click()
  await expect(page.getByText('Please enter a valid Airbnb listing URL')).toBeVisible()
})

test('shows error for spoofed airbnb domain', async ({ page }) => {
  await page.goto('/')
  await page.getByPlaceholder('https://airbnb.com/rooms/...').fill('https://airbnb.com.evil.com/rooms/12345')
  await page.getByRole('button', { name: 'Analyze' }).click()
  await expect(page.getByText('Please enter a valid Airbnb listing URL')).toBeVisible()
})

test('clears error when typing', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Analyze' }).click()
  await expect(page.getByText('Please enter an Airbnb listing URL.')).toBeVisible()
  await page.getByPlaceholder('https://airbnb.com/rooms/...').fill('h')
  await expect(page.getByText('Please enter an Airbnb listing URL.')).not.toBeVisible()
})

test('submit via Enter key works', async ({ page }) => {
  await page.goto('/')
  await page.getByPlaceholder('https://airbnb.com/rooms/...').fill('https://airbnb.com/rooms/12345')
  await page.getByPlaceholder('https://airbnb.com/rooms/...').press('Enter')
  // Should advance to plan selection (mock mode skips Stripe)
  await expect(page.getByText('Choose your report')).toBeVisible()
})

// ─── Plan Selection ─────────────────────────────────────────

test('valid URL advances to plan selection', async ({ page }) => {
  await page.goto('/')
  await page.getByPlaceholder('https://airbnb.com/rooms/...').fill('https://airbnb.com/rooms/12345')
  await page.getByRole('button', { name: 'Analyze' }).click()
  await expect(page.getByText('Choose your report')).toBeVisible()
  await expect(page.getByText('Quick Score', { exact: true }).first()).toBeVisible()
  await expect(page.getByText('Full Audit', { exact: true }).first()).toBeVisible()
})

test('plan selection shows listing URL', async ({ page }) => {
  await page.goto('/')
  await page.getByPlaceholder('https://airbnb.com/rooms/...').fill('https://airbnb.com/rooms/99999')
  await page.getByRole('button', { name: 'Analyze' }).click()
  await expect(page.getByText('https://airbnb.com/rooms/99999')).toBeVisible()
})

test('change URL link goes back to input', async ({ page }) => {
  await page.goto('/')
  await page.getByPlaceholder('https://airbnb.com/rooms/...').fill('https://airbnb.com/rooms/12345')
  await page.getByRole('button', { name: 'Analyze' }).click()
  await expect(page.getByText('Choose your report')).toBeVisible()
  await page.getByText('Change URL').click()
  await expect(page.getByPlaceholder('https://airbnb.com/rooms/...')).toBeVisible()
})

test('Full Audit is pre-selected', async ({ page }) => {
  await page.goto('/')
  await page.getByPlaceholder('https://airbnb.com/rooms/...').fill('https://airbnb.com/rooms/12345')
  await page.getByRole('button', { name: 'Analyze' }).click()
  // Full Audit should be pre-selected (default)
  await expect(page.getByRole('button', { name: /Continue with Full Audit/ })).toBeVisible()
})

test('selecting Quick Score updates continue button', async ({ page }) => {
  await page.goto('/')
  await page.getByPlaceholder('https://airbnb.com/rooms/...').fill('https://airbnb.com/rooms/12345')
  await page.getByRole('button', { name: 'Analyze' }).click()
  await page.getByText('Quick Score').first().click()
  await expect(page.getByRole('button', { name: /Continue with Quick Score/ })).toBeVisible()
})

// ─── Photo Upload Step (Full Audit) ─────────────────────────

test('Full Audit shows photo upload step', async ({ page }) => {
  await page.goto('/')
  await page.getByPlaceholder('https://airbnb.com/rooms/...').fill('https://airbnb.com/rooms/12345')
  await page.getByRole('button', { name: 'Analyze' }).click()
  // Full Audit is pre-selected, click continue
  await page.getByRole('button', { name: /Continue with Full Audit/ }).click()
  await expect(page.getByText('Upload your listing photos')).toBeVisible()
  await expect(page.getByText('Drop photos here or click to browse')).toBeVisible()
})

test('photo upload step shows skip button', async ({ page }) => {
  await page.goto('/')
  await page.getByPlaceholder('https://airbnb.com/rooms/...').fill('https://airbnb.com/rooms/12345')
  await page.getByRole('button', { name: 'Analyze' }).click()
  await page.getByRole('button', { name: /Continue with Full Audit/ }).click()
  await expect(page.getByText(/Skip.*use listing photos instead/)).toBeVisible()
})

test('photo upload continue button is disabled without photos', async ({ page }) => {
  await page.goto('/')
  await page.getByPlaceholder('https://airbnb.com/rooms/...').fill('https://airbnb.com/rooms/12345')
  await page.getByRole('button', { name: 'Analyze' }).click()
  await page.getByRole('button', { name: /Continue with Full Audit/ }).click()
  const continueBtn = page.getByRole('button', { name: 'Continue to payment' })
  await expect(continueBtn).toBeDisabled()
})

test('photo upload shows file constraints', async ({ page }) => {
  await page.goto('/')
  await page.getByPlaceholder('https://airbnb.com/rooms/...').fill('https://airbnb.com/rooms/12345')
  await page.getByRole('button', { name: 'Analyze' }).click()
  await page.getByRole('button', { name: /Continue with Full Audit/ }).click()
  await expect(page.getByText('Up to 10 photos')).toBeVisible()
  await expect(page.getByText('JPG, PNG, WebP')).toBeVisible()
  await expect(page.getByText('4 MB max each')).toBeVisible()
})

// ─── Quick Score Mock Flow ──────────────────────────────────

test('Quick Score mock flow runs analysis and shows report', async ({ page }) => {
  await page.goto('/')
  await page.getByPlaceholder('https://airbnb.com/rooms/...').fill('https://airbnb.com/rooms/12345')
  await page.getByRole('button', { name: 'Analyze' }).click()
  await page.getByText('Quick Score').first().click()
  await page.getByRole('button', { name: /Continue with Quick Score/ }).click()

  // In mock mode, should skip payment and show loading then report
  await expect(page.getByText('Priority action plan')).toBeVisible({ timeout: 20_000 })
})

// ─── Demo Mode ──────────────────────────────────────────────

test('demo button shows full report', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Try demo' }).click()

  // Report should render with full demo data
  await expect(page.getByText('Priority action plan')).toBeVisible({ timeout: 10_000 })
  await expect(page.getByText('Airbnb listing score')).toBeVisible()
})

test('demo via URL param - quick-score', async ({ page }) => {
  await page.goto('/?demo=quick-score')
  await expect(page.getByText('Priority action plan')).toBeVisible({ timeout: 10_000 })
  await expect(page.getByText('Airbnb listing score')).toBeVisible()
})

test('demo via URL param - full-audit shows photo analysis', async ({ page }) => {
  await page.goto('/?demo=full-audit')
  await expect(page.getByText('Priority action plan')).toBeVisible({ timeout: 10_000 })
  // Full Audit demo should include photo analysis section
  await expect(page.getByText('AI Photo Analysis')).toBeVisible({ timeout: 5_000 })
})

test('demo report shows "Analyze another listing" link', async ({ page }) => {
  await page.goto('/?demo=quick-score')
  await expect(page.getByText('Priority action plan')).toBeVisible({ timeout: 10_000 })
  await expect(page.getByText('Analyze another listing')).toBeVisible()
})

test('demo shows plan badge', async ({ page }) => {
  await page.goto('/?demo=quick-score')
  await expect(page.getByText('Quick Score · Demo')).toBeVisible({ timeout: 10_000 })
})

test('demo full-audit shows Full Audit badge', async ({ page }) => {
  await page.goto('/?demo=full-audit')
  await expect(page.getByText('Full Audit · Demo')).toBeVisible({ timeout: 10_000 })
})

test('demo invalid plan param falls through to input', async ({ page }) => {
  await page.goto('/?demo=invalid-plan')
  // Should show the normal input form, not a report
  await expect(page.getByPlaceholder('https://airbnb.com/rooms/...')).toBeVisible()
})

// ─── New Tab Param ──────────────────────────────────────────

test('?new=1 skips localStorage restore', async ({ page }) => {
  // Set up localStorage with a report, then visit with ?new=1
  await page.goto('/')
  await page.evaluate(() => {
    localStorage.setItem('listingiq_report', JSON.stringify({ overallScore: 50, summary: 'test' }))
  })
  await page.goto('/?new=1')
  // Should show input form, not the saved report
  await expect(page.getByPlaceholder('https://airbnb.com/rooms/...')).toBeVisible()
})

// ─── URL Restore on Cancel Redirect ─────────────────────────

test('URL param restores URL in input', async ({ page }) => {
  await page.goto('/?url=https%3A%2F%2Fairbnb.com%2Frooms%2F99999')
  await expect(page.getByPlaceholder('https://airbnb.com/rooms/...')).toHaveValue('https://airbnb.com/rooms/99999')
})

// ─── Reset / Analyze Another ────────────────────────────────

test('reset clears report and returns to input', async ({ page }) => {
  await page.goto('/?demo=quick-score')
  await expect(page.getByText('Priority action plan')).toBeVisible({ timeout: 10_000 })
  await page.getByText('Analyze another listing').click()
  await expect(page.getByPlaceholder('https://airbnb.com/rooms/...')).toBeVisible()
})

test('reset clears localStorage', async ({ page }) => {
  await page.goto('/?demo=quick-score')
  await expect(page.getByText('Priority action plan')).toBeVisible({ timeout: 10_000 })
  // Set some localStorage to verify it gets cleared
  await page.evaluate(() => {
    localStorage.setItem('listingiq_report', 'test')
    localStorage.setItem('listingiq_plan', 'test')
    localStorage.setItem('listingiq_url', 'test')
  })
  await page.getByText('Analyze another listing').click()
  const reportVal = await page.evaluate(() => localStorage.getItem('listingiq_report'))
  const planVal = await page.evaluate(() => localStorage.getItem('listingiq_plan'))
  const urlVal = await page.evaluate(() => localStorage.getItem('listingiq_url'))
  expect(reportVal).toBeNull()
  expect(planVal).toBeNull()
  expect(urlVal).toBeNull()
})

// ─── Pricing Page ───────────────────────────────────────────

test('pricing page loads', async ({ page }) => {
  await page.goto('/pricing')
  await expect(page.getByText('Quick Score', { exact: true }).first()).toBeVisible()
  await expect(page.getByText('Full Audit', { exact: true }).first()).toBeVisible()
})

test('pricing page shows both plan prices', async ({ page }) => {
  await page.goto('/pricing')
  await expect(page.getByText('$29')).toBeVisible()
  await expect(page.getByText('$49')).toBeVisible()
})

test('pricing page shows "Most popular" badge on Full Audit', async ({ page }) => {
  await page.goto('/pricing')
  await expect(page.getByText('Most popular')).toBeVisible()
})

test('pricing page shows plan features', async ({ page }) => {
  await page.goto('/pricing')
  await expect(page.getByText('Title, description & amenity analysis')).toBeVisible()
  await expect(page.getByText(/AI photo analysis.*upload yours/)).toBeVisible()
  await expect(page.getByText('PDF report + email delivery')).toBeVisible()
})

test('pricing page shows Stripe checkout info', async ({ page }) => {
  await page.goto('/pricing')
  await expect(page.getByText('Secure checkout via Stripe')).toBeVisible()
})

test('pricing page buttons show "Try demo" in mock mode', async ({ page }) => {
  await page.goto('/pricing')
  // In mock mode (NEXT_PUBLIC_USE_MOCK_API=true), buttons show "Try demo →"
  const demoButtons = page.getByRole('button', { name: /Try demo/ })
  await expect(demoButtons.first()).toBeVisible()
})

test('pricing Quick Score redirects to demo in mock mode', async ({ page }) => {
  await page.goto('/pricing')
  const buttons = page.getByRole('button', { name: /Try demo/ })
  await buttons.first().click()
  await page.waitForURL('**/?demo=quick-score')
  await expect(page.getByText('Priority action plan')).toBeVisible({ timeout: 10_000 })
})

test('pricing Full Audit redirects to demo in mock mode', async ({ page }) => {
  await page.goto('/pricing')
  const buttons = page.getByRole('button', { name: /Try demo/ })
  await buttons.last().click()
  await page.waitForURL('**/?demo=full-audit')
  await expect(page.getByText('Priority action plan')).toBeVisible({ timeout: 10_000 })
})

// ─── Health Endpoint ────────────────────────────────────────

test('health endpoint returns ok', async ({ request }) => {
  const res = await request.get('/api/health')
  expect(res.status()).toBe(200)
  const body = await res.json()
  expect(body.status).toBe('ok')
})

test('health endpoint returns version', async ({ request }) => {
  const res = await request.get('/api/health')
  const body = await res.json()
  expect(body.version).toBeDefined()
})

// ─── API: Analyze (Mock Mode) ───────────────────────────────

test('analyze API returns mock report for demo', async ({ request }) => {
  const res = await request.post('/api/analyze', {
    data: { isDemo: true, url: 'https://airbnb.com/rooms/12345' },
  })
  expect(res.status()).toBe(200)
  const body = await res.json()
  expect(body.overallScore).toBeDefined()
  expect(body.summary).toBeDefined()
  expect(body.priorityActions).toBeDefined()
  expect(body.titleScore).toBeDefined()
  expect(body.descriptionScore).toBeDefined()
})

test('analyze API mock report has valid structure', async ({ request }) => {
  const res = await request.post('/api/analyze', {
    data: { isDemo: true },
  })
  expect(res.status()).toBe(200)
  const body = await res.json()
  // Check all required report fields
  expect(typeof body.overallScore).toBe('number')
  expect(typeof body.summary).toBe('string')
  expect(Array.isArray(body.priorityActions)).toBe(true)
  expect(body.priorityActions.length).toBeGreaterThan(0)
  expect(typeof body.titleScore).toBe('number')
  expect(Array.isArray(body.titleSuggestions)).toBe(true)
  expect(typeof body.descriptionScore).toBe('number')
  expect(typeof body.descriptionRewrite).toBe('string')
  expect(typeof body.photoScore).toBe('number')
  expect(typeof body.amenityScore).toBe('number')
  expect(typeof body.personaScore).toBe('number')
  expect(typeof body.reviewScore).toBe('number')
  expect(Array.isArray(body.seoKeywords)).toBe(true)
  expect(Array.isArray(body.conversionTips)).toBe(true)
  expect(typeof body.estimatedImprovement).toBe('string')
})

// ─── API: Upload Photos Validation ──────────────────────────

test('upload-photos rejects empty request', async ({ request }) => {
  const res = await request.post('/api/upload-photos', {
    multipart: { _empty: '' },
  })
  // Should fail with 400 or 500 (no photos)
  expect(res.status()).toBeGreaterThanOrEqual(400)
})

// ─── API: Usage Endpoint ────────────────────────────────────

test('usage endpoint requires userId', async ({ request }) => {
  const res = await request.get('/api/usage')
  const body = await res.json()
  expect(body.canAnalyze).toBe(false)
  expect(body.reason).toContain('Not authenticated')
})

// ─── Report Content (Demo) ──────────────────────────────────

test('demo report shows all main sections', async ({ page }) => {
  await page.goto('/?demo=quick-score')
  await expect(page.getByText('Priority action plan')).toBeVisible({ timeout: 10_000 })

  // Check main report sections (matches ReportSection titles in Report.tsx)
  await expect(page.getByText('Airbnb listing score')).toBeVisible()
  await expect(page.getByText('Title optimization')).toBeVisible()
  await expect(page.getByText('Description quality')).toBeVisible()
  await expect(page.getByText('Amenity strength')).toBeVisible()
  await expect(page.getByText('Guest persona match')).toBeVisible()
  await expect(page.getByText('Review sentiment')).toBeVisible()
})

test('demo report shows title suggestions', async ({ page }) => {
  await page.goto('/?demo=quick-score')
  await expect(page.getByText('Priority action plan')).toBeVisible({ timeout: 10_000 })
  await expect(page.getByText('Suggested titles')).toBeVisible()
})

test('demo report shows SEO keywords section', async ({ page }) => {
  await page.goto('/?demo=quick-score')
  await expect(page.getByText('Priority action plan')).toBeVisible({ timeout: 10_000 })
  await expect(page.getByText('Keywords & optimization tips')).toBeVisible()
  await expect(page.getByText('Phrases your target guests search for')).toBeVisible()
})

test('demo report shows conversion tips', async ({ page }) => {
  await page.goto('/?demo=quick-score')
  await expect(page.getByText('Priority action plan')).toBeVisible({ timeout: 10_000 })
  await expect(page.getByText('Listing optimization tips')).toBeVisible()
})

test('demo report shows estimated improvement', async ({ page }) => {
  await page.goto('/?demo=quick-score')
  await expect(page.getByText('Priority action plan')).toBeVisible({ timeout: 10_000 })
  await expect(page.getByText(/Est\. improvement potential/)).toBeVisible()
})

test('demo report shows competitor insights', async ({ page }) => {
  await page.goto('/?demo=quick-score')
  await expect(page.getByText('Priority action plan')).toBeVisible({ timeout: 10_000 })
  await expect(page.getByText('Best practices from top-performing listings')).toBeVisible()
})

test('demo report shows PDF download button', async ({ page }) => {
  await page.goto('/?demo=quick-score')
  await expect(page.getByText('Priority action plan')).toBeVisible({ timeout: 10_000 })
  await expect(page.getByText('Save your report')).toBeVisible()
})

// ─── Full Audit Demo: Photo Analysis ────────────────────────

test('full-audit demo shows AI Photo Analysis section', async ({ page }) => {
  await page.goto('/?demo=full-audit')
  await expect(page.getByText('Priority action plan')).toBeVisible({ timeout: 10_000 })
  await expect(page.getByText('AI Photo Analysis')).toBeVisible()
})

test('full-audit demo shows suggested cover photo', async ({ page }) => {
  await page.goto('/?demo=full-audit')
  await expect(page.getByText('Priority action plan')).toBeVisible({ timeout: 10_000 })
  await expect(page.getByText('Suggested cover photo')).toBeVisible()
})

test('full-audit demo shows photo verdicts (keep/retake)', async ({ page }) => {
  await page.goto('/?demo=full-audit')
  await expect(page.getByText('Priority action plan')).toBeVisible({ timeout: 10_000 })
  // Demo photo verdicts are lowercase in the rendered UI
  const keepBadges = page.locator('span:has-text("keep")')
  const retakeBadges = page.locator('span:has-text("retake")')
  const keepCount = await keepBadges.count()
  const retakeCount = await retakeBadges.count()
  expect(keepCount + retakeCount).toBeGreaterThan(0)
})

test('full-audit demo shows photo labels', async ({ page }) => {
  await page.goto('/?demo=full-audit')
  await expect(page.getByText('Priority action plan')).toBeVisible({ timeout: 10_000 })
  await expect(page.getByText('Living Room', { exact: true })).toBeVisible()
  await expect(page.getByText('Kitchen', { exact: true })).toBeVisible()
  await expect(page.getByText('Bedroom', { exact: true })).toBeVisible()
})

test('full-audit demo shows Photos sub-score', async ({ page }) => {
  await page.goto('/?demo=full-audit')
  await expect(page.getByText('Priority action plan')).toBeVisible({ timeout: 10_000 })
  // Full Audit shows a "Photos" sub-score chip
  await expect(page.getByText('Photos', { exact: true })).toBeVisible()
})

test('full-audit demo shows demo disclaimer', async ({ page }) => {
  await page.goto('/?demo=full-audit')
  await expect(page.getByText('Priority action plan')).toBeVisible({ timeout: 10_000 })
  await expect(page.getByText(/Demo data.*upload your real photos/)).toBeVisible()
})

// ─── Quick Score Demo: Upgrade Prompt ───────────────────────

test('quick-score demo shows upgrade to Full Audit prompt', async ({ page }) => {
  await page.goto('/?demo=quick-score')
  await expect(page.getByText('Priority action plan')).toBeVisible({ timeout: 10_000 })
  await expect(page.getByText('Want more from your analysis?')).toBeVisible()
  await expect(page.getByText('Try Full Audit demo')).toBeVisible()
})

test('quick-score demo shows Photo tips section', async ({ page }) => {
  await page.goto('/?demo=quick-score')
  await expect(page.getByText('Priority action plan')).toBeVisible({ timeout: 10_000 })
  // Quick Score shows "Photo tips" instead of "AI Photo Analysis"
  await expect(page.getByText('Photo tips')).toBeVisible()
})

// ─── Human Expert Upsell ────────────────────────────────────

test('demo report shows human expert upsell', async ({ page }) => {
  await page.goto('/?demo=quick-score')
  await expect(page.getByText('Priority action plan')).toBeVisible({ timeout: 10_000 })
  await expect(page.getByText('Want a human expert instead?')).toBeVisible()
  await expect(page.getByText('Airbnb Listing Optimization')).toBeVisible()
})

// ─── localStorage Persistence ───────────────────────────────

test('URL is saved to localStorage on submit', async ({ page }) => {
  await page.goto('/')
  await page.getByPlaceholder('https://airbnb.com/rooms/...').fill('https://airbnb.com/rooms/12345')
  await page.getByRole('button', { name: 'Analyze' }).click()
  await expect(page.getByText('Choose your report')).toBeVisible()
  const saved = await page.evaluate(() => localStorage.getItem('listingiq_url'))
  expect(saved).toBe('https://airbnb.com/rooms/12345')
})

test('saved report restores on page load', async ({ page }) => {
  await page.goto('/')
  // Manually set a minimal saved report in localStorage
  await page.evaluate(() => {
    const report = {
      overallScore: 75,
      summary: 'Test saved report summary unique marker',
      priorityActions: ['Action 1'],
      titleScore: 80, descriptionScore: 70, photoScore: 60,
      amenityScore: 65, personaScore: 72, reviewScore: 85,
      titleProblems: [], titleSuggestions: [],
      descriptionProblems: [], descriptionRewrite: 'test',
      photoCount: 5, missingPhotos: [],
      topAmenities: [], amenityGaps: [],
      primaryPersona: 'test', personaProblems: [], personaSuggestion: '',
      competitorInsight: '', guestLoves: [], reviewRisks: [],
      seoKeywords: [], conversionTips: [],
      estimatedImprovement: 'Good',
    }
    localStorage.setItem('listingiq_report', JSON.stringify(report))
    localStorage.setItem('listingiq_url', 'https://airbnb.com/rooms/12345')
  })
  await page.goto('/')
  // Should show the restored report, not the input form
  await expect(page.getByText('Test saved report summary unique marker')).toBeVisible({ timeout: 5_000 })
})

// ─── Cross-page Navigation ─────────────────────────────────

test('pricing page to home page flow works', async ({ page }) => {
  await page.goto('/pricing')
  await expect(page.getByText('Simple, honest pricing')).toBeVisible()
  // Navigate to home
  await page.goto('/')
  await expect(page.getByPlaceholder('https://airbnb.com/rooms/...')).toBeVisible()
})

// ─── Full E2E: Demo Quick Score Flow ────────────────────────

test('complete demo quick-score flow: input → plan → loading → report', async ({ page }) => {
  await page.goto('/')

  // Step 1: Enter URL
  await page.getByPlaceholder('https://airbnb.com/rooms/...').fill('https://airbnb.com/rooms/12345')
  await page.getByRole('button', { name: 'Analyze' }).click()

  // Step 2: Select Quick Score
  await expect(page.getByText('Choose your report')).toBeVisible()
  await page.getByText('Quick Score').first().click()
  await page.getByRole('button', { name: /Continue with Quick Score/ }).click()

  // Step 3: Loading (in mock mode, should transition quickly)
  // Step 4: Report renders
  await expect(page.getByText('Priority action plan')).toBeVisible({ timeout: 20_000 })
  await expect(page.getByText('Airbnb listing score')).toBeVisible()
  await expect(page.getByText('Analyze another listing')).toBeVisible()
})

// ─── Full E2E: Full Audit Skip Photos Flow ──────────────────

test('complete full-audit skip photos flow', async ({ page }) => {
  await page.goto('/')

  // Enter URL
  await page.getByPlaceholder('https://airbnb.com/rooms/...').fill('https://airbnb.com/rooms/12345')
  await page.getByRole('button', { name: 'Analyze' }).click()

  // Full Audit is pre-selected, continue
  await page.getByRole('button', { name: /Continue with Full Audit/ }).click()

  // Photo upload step: skip
  await expect(page.getByText('Upload your listing photos')).toBeVisible()
  await page.getByText(/Skip.*use listing photos instead/).click()

  // Should go to loading and then report (in mock mode)
  await expect(page.getByText('Priority action plan')).toBeVisible({ timeout: 20_000 })
})

// ─── Disclaimer & Footer ───────────────────────────────────

test('landing page shows disclaimer text', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByText(/Results are AI-generated/)).toBeVisible()
  await expect(page.getByText(/not affiliated with Airbnb/)).toBeVisible()
})

test('landing page shows contact link', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByText('Message us on Facebook')).toBeVisible()
})
