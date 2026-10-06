import { expect, test } from '@playwright/test'

/**
 * Compact (phone) layout: the session list becomes a drawer and the composer
 * stays reachable above the fold.
 */
test.use({ viewport: { width: 390, height: 844 } })

test.beforeEach(async ({ page, request }) => {
  // Every test starts from the same seeded, empty session.
  await request.post('http://127.0.0.1:4096/__reset')
  await page.addInitScript(() => {
    window.localStorage.clear()
    window.sessionStorage.clear()
  })
})

test('starts with the drawer closed and opens it from the header', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('button', { name: /^Connected\./ })).toBeVisible()

  // No docked sidebar on a phone.
  await expect(page.getByRole('complementary', { name: 'Sessions' })).toHaveCount(0)

  await page.getByLabel('Open sessions').click()
  const drawer = page.getByRole('dialog', { name: 'Sessions' })
  await expect(drawer).toBeVisible()
  await expect(drawer.getByText('Seeded session')).toBeVisible()

  await drawer.getByRole('button', { name: 'Close' }).click()
  await expect(page.getByRole('dialog', { name: 'Sessions' })).toHaveCount(0)
})

test('prompts and toggles the activity drawer', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('button', { name: /^Connected\./ })).toBeVisible()
  await expect(page.getByRole('textbox', { name: 'Prompt' })).toBeEnabled()

  const composer = page.getByRole('textbox', { name: 'Prompt' })
  await composer.fill('hello from a phone')
  await composer.press('Enter')

  await expect(page.getByLabel('Your message')).toContainText('hello from a phone')
  await expect(page.getByLabel('OpenCode response')).toContainText('Here is the plan:')

  await page.getByLabel('Toggle file activity').click()
  const activity = page.getByRole('dialog', { name: 'Activity' })
  await expect(activity).toBeVisible()
  await expect(activity.getByRole('tab', { name: /Files/ })).toBeVisible()
})

test('keeps the layout inside the viewport', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('button', { name: /^Connected\./ })).toBeVisible()

  const overflow = await page.evaluate(() => {
    const width = document.documentElement.clientWidth
    return {
      scrollWidth: document.documentElement.scrollWidth,
      width,
      composerBottom: document.querySelector('.composer')?.getBoundingClientRect().bottom ?? 0,
      innerHeight: window.innerHeight,
    }
  })

  expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.width + 1)
  expect(overflow.composerBottom).toBeLessThanOrEqual(overflow.innerHeight + 1)
})
