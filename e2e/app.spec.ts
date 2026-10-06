import { expect, test, type Page } from '@playwright/test'

/**
 * Happy path against a real HTTP + SSE server (no mocking in the browser):
 * connect, create a session, prompt, watch the streamed reply, browse the file
 * activity, run a shell command, abort, rename, delete and finally break the
 * connection on purpose.
 */
const REPLY_MARKER = 'Here is the plan:'

test.beforeEach(async ({ page, request }) => {
  // Every test starts from the same seeded, empty session.
  await request.post('http://127.0.0.1:4096/__reset')
  await page.addInitScript(() => {
    window.localStorage.clear()
    window.sessionStorage.clear()
  })
})

const composer = (page: Page) =>
  page.getByRole('textbox', { name: 'Prompt' })

/** Load the app and wait until it is connected *and* a session is selected. */
async function openApp(page: Page) {
  await page.goto('/')
  await expect(page.getByRole('button', { name: /^Connected\./ })).toBeVisible()
  await expect(composer(page)).toBeEnabled()
}

test('renders the shell and connects to the server', async ({ page }) => {
  await page.goto('/')

  await expect(page.getByRole('banner')).toContainText('Remote')
  await expect(page.getByRole('button', { name: /^Connected\./ })).toBeVisible()
  await expect(page.getByLabel('Conversation')).toBeVisible()
  await expect(page.getByText('Send a prompt to your local OpenCode agent.')).toBeVisible()
})

test('creates a session, prompts, and renders the streamed reply', async ({ page }) => {
  await openApp(page)

  const sidebar = page.getByRole('complementary', { name: 'Sessions' })
  const before = await sidebar.locator('.session__select').count()
  await sidebar.getByLabel('New session').click()
  await expect(sidebar.locator('.session--active .session__select').first()).toBeVisible()
  await expect
    .poll(() => sidebar.locator('.session__select').count())
    .toBeGreaterThan(before)

  const input = composer(page)
  await input.fill('plan the release')
  await input.press('Enter')

  // The user message appears immediately (optimistic echo).
  await expect(page.getByLabel('Your message')).toContainText('plan the release')

  // Tool activity shows up as a compact one-liner.
  await expect(page.locator('.tool__label').filter({ hasText: 'Running npm test' })).toBeVisible()

  // The answer streams into the transcript, with markdown structure.
  const response = page.getByLabel('OpenCode response')
  await expect(response).toContainText(REPLY_MARKER)
  await expect(response.locator('li')).toHaveCount(2)
  await expect(response.locator('table')).toBeVisible()
  await expect(response.getByRole('button', { name: 'Copy code' })).toBeVisible()

  // Streaming ends: Stop is gone and the composer is usable again.
  await expect(page.getByRole('button', { name: 'Stop' })).toHaveCount(0)
  await expect(page.getByLabel('Send prompt')).toBeVisible()
})

test('copies a code block and confirms it', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await openApp(page)

  const input = composer(page)
  await input.fill('write the snippet')
  await input.press('Enter')

  const copyButton = page.getByLabel('OpenCode response').getByRole('button', { name: 'Copy code' })
  await copyButton.click()
  await expect(page.getByRole('status').filter({ hasText: 'Copied to clipboard' })).toBeVisible()

  const clipboard = await page.evaluate(() => navigator.clipboard.readText())
  expect(clipboard).toContain('client.session.list()')
})

test('shows a failed tool call without a stack trace', async ({ page }) => {
  await openApp(page)

  const input = composer(page)
  await input.fill('TOOLFAIL please')
  await input.press('Enter')

  await expect(
    page.locator('.tool__label').filter({ hasText: 'Running node scripts/missing.mjs' }),
  ).toBeVisible()
  // The error is shown in the tool body, without a stack trace.
  await expect(page.locator('.tool__body')).toContainText('Cannot find module')
  await expect(page.locator('body')).not.toContainText('at Object.<anonymous>')
})

test('lists changed files after a session diff event', async ({ page }) => {
  await openApp(page)

  const input = composer(page)
  await input.fill('DIFF what changed?')
  await input.press('Enter')

  // The activity panel is off by default on desktop.
  await page.getByLabel('Toggle file activity').click()
  const activity = page.getByRole('complementary', { name: 'File activity' })
  await expect(activity).toContainText('src/app.ts')
  await expect(activity).toContainText('README.md')
  await expect(activity.locator('.activity__stat--add').first()).toHaveText('+3')
})

test('runs shell commands in command mode', async ({ page }) => {
  await openApp(page)

  await page.getByLabel('Toggle shell command mode').click()
  await expect(page.getByLabel('Toggle shell command mode')).toHaveAttribute('aria-pressed', 'true')

  const input = composer(page)
  await input.fill('git status --short')
  await input.press('Enter')

  await expect(
    page.locator('.tool__label').filter({ hasText: 'Running git status --short' }),
  ).toBeVisible()
})

test('aborts a running turn', async ({ page }) => {
  await openApp(page)

  const input = composer(page)
  await input.fill('SLOW long running job')
  await input.press('Enter')

  const stop = page.getByRole('button', { name: 'Stop' })
  await expect(stop).toBeVisible()
  await stop.click()

  await expect(page.getByRole('button', { name: 'Stop' })).toHaveCount(0)
  await expect(page.getByLabel('Send prompt')).toBeVisible()
})

test('renames and deletes a session', async ({ page }) => {
  await openApp(page)

  const sidebar = page.getByRole('complementary', { name: 'Sessions' })
  await sidebar.getByLabel('New session').click()

  const newest = sidebar.locator('.session').first()
  await newest.getByLabel(/^Rename /).click()
  const field = sidebar.getByRole('textbox', { name: 'Session title' })
  await field.fill('Temp session')
  await field.press('Enter')
  await expect(sidebar.getByText('Temp session')).toBeVisible()

  await sidebar.locator('.session').first().getByLabel(/^Delete /).click()
  await sidebar.getByRole('button', { name: 'Delete', exact: true }).click()
  await expect(sidebar.getByText('Temp session')).toHaveCount(0)
})

test('reports an offline server instead of failing silently', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('button', { name: /^Connected\./ })).toBeVisible()

  // Point Remote at a port where nothing is listening.
  await page.getByLabel('Open settings').click()
  await page.locator('#settings-url').fill('http://127.0.0.1:9')
  await page.getByRole('button', { name: 'Save & connect' }).click()

  const banner = page.getByRole('main').getByRole('alert')
  await expect(banner).toContainText('OpenCode server is offline.')
  await expect(banner.getByRole('button', { name: /Retry|Reconnect/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /^(Disconnected|Connection error)\./ })).toBeVisible()
  await expect(
    page.getByRole('banner').getByRole('button', { name: 'Connect', exact: true }),
  ).toBeVisible()
})

test('rejects bad credentials with a friendly message', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('button', { name: /^Connected\./ })).toBeVisible()

  await page.getByLabel('Open settings').click()
  await page.locator('#settings-password').fill('not-the-password')
  await page.getByRole('button', { name: 'Save & connect' }).click()

  const banner = page.getByRole('main').getByRole('alert')
  await expect(banner).toContainText(/Unable to authenticate|rejected these credentials/)
  await expect(banner).not.toContainText('not-the-password')
})

test('test connection reports the server version', async ({ page }) => {
  await page.goto('/')
  await page.getByLabel('Open settings').click()

  await page.locator('#settings-url').fill('http://127.0.0.1:4096')
  await page.locator('#settings-password').fill('test-secret')
  await page.getByRole('button', { name: 'Test connection' }).first().click()

  await expect(page.getByText(/OpenCode version: 1\.18\.34-test/)).toBeVisible()
  await expect(page.getByRole('button', { name: /^Connected\./ })).toBeVisible()
})

test('keyboard: Ctrl+, opens settings and Escape closes it', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('button', { name: /^Connected\./ })).toBeVisible()

  await page.keyboard.press('Control+Comma')
  await expect(page.getByRole('dialog', { name: 'Connection settings' })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog', { name: 'Connection settings' })).toHaveCount(0)
})
