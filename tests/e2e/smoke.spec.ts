import { test, expect } from '@playwright/test'

test('landing page loads and shows main heading', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('h1').first()).toBeVisible()
})

test('pricing page loads', async ({ page }) => {
  await page.goto('/pricing')
  await expect(page.locator('text=Quick Score')).toBeVisible()
  await expect(page.locator('text=Full Audit')).toBeVisible()
})

test('demo analysis runs in mock mode', async ({ page }) => {
  await page.goto('/?demo=quick-score')
  // Wait for the mock report to render (loading steps + report)
  await expect(page.locator('text=Priority action plan')).toBeVisible({ timeout: 20_000 })
})

test('health endpoint returns ok', async ({ request }) => {
  const res = await request.get('/api/health')
  expect(res.status()).toBe(200)
  const body = await res.json()
  expect(body.status).toBe('ok')
})
