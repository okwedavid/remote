import { expect, test } from '@playwright/test'

/**
 * The production bundle (`vite build` output served by `vite preview`) with the
 * server URL supplied by `VITE_OPENCODE_URL` at build time — the same shape as
 * the Render deployment, minus the tunnel.
 */
test.beforeEach(async ({ page, request }) => {
  // Every test starts from the same seeded, empty session.
  await request.post('http://127.0.0.1:4096/__reset')
  await page.addInitScript(() => {
    window.localStorage.clear()
    window.sessionStorage.clear()
  })
})

test('uses the build-time server URL and connects', async ({ page }) => {
  await page.goto('/')

  const status = page.getByRole('button', { name: /^Connected\./ })
  await expect(status).toBeVisible()
  await expect(status).toHaveAttribute('title', /127\.0\.0\.1:4096/)

  // Mock mode is off by default, so no mock badge in a production build.
  await expect(page.getByText('Mock', { exact: true })).toHaveCount(0)
})

test('serves the SPA shell without a router (single entry point)', async ({ page }) => {
  const response = await page.goto('/')
  expect(response?.status()).toBe(200)
  await expect(page).toHaveTitle(/Remote/i)
})

test('runs a full prompt round trip in the built bundle', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('button', { name: /^Connected\./ })).toBeVisible()
  await expect(page.getByRole('textbox', { name: 'Prompt' })).toBeEnabled()

  const composer = page.getByRole('textbox', { name: 'Prompt' })
  await composer.fill('ship it')
  await composer.press('Enter')

  await expect(page.getByLabel('OpenCode response')).toContainText('Here is the plan:')
  await expect(page.getByRole('button', { name: 'Stop' })).toHaveCount(0)
})

test('still works without the clipboard permission (copy fallback)', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('button', { name: /^Connected\./ })).toBeVisible()
  await expect(page.getByRole('textbox', { name: 'Prompt' })).toBeEnabled()

  const composer = page.getByRole('textbox', { name: 'Prompt' })
  await composer.fill('write the snippet')
  await composer.press('Enter')

  // Playwright grants clipboard-write only when asked; a plain click must not throw.
  const copy = page.getByLabel('OpenCode response').getByRole('button', { name: 'Copy code' })
  await expect(copy).toBeVisible()
  await copy.click()
  await expect(page.getByLabel('OpenCode response').getByRole('button', { name: /Copy code|Copied/ })).toBeVisible()
})
