import { expect, test } from '@playwright/test'
import { profile } from '../src/lib/fixture'

const demo = process.env.NEXT_PUBLIC_BRIEFHARBOR_DEMO === 'true'

test('Account entry points work at mobile and desktop widths', async ({ page }, testInfo) => {
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname
    if (path === '/api/auth/session') return route.fulfill({ status: 401, json: { error: { code: 'UNAUTHORIZED', message: 'Sign in.', fieldErrors: {} } } })
    if (path === '/api/auth/csrf') return route.fulfill({ json: { data: { token: 'a'.repeat(64) } } })
    return route.fulfill({ status: 401, json: { error: { code: 'INVALID_LOGIN', message: 'Email or password is incorrect.', fieldErrors: {} } } })
  })
  await page.goto('/login')
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible()
  await expect(page.locator('.auth-header')).toHaveCount(1)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width)
  await page.getByRole('navigation', { name: 'Account access' }).getByRole('link', { name: 'Sign up' }).click()
  await expect(page.getByRole('heading', { name: 'Create your account' })).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('signup.png'), fullPage: true })
  await page.getByLabel('Full name').fill('Demo Visitor')
  await page.getByLabel(demo ? 'Email' : 'Work email', { exact: true }).fill('visitor@example.test')
  if (demo) {
    await expect(page.getByLabel('Password', { exact: true })).toHaveCount(0)
    await page.getByRole('button', { name: 'Create demo profile' }).click()
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()
    await page.reload()
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('briefharbor.demo-profile.v1')!))).toEqual({ name: 'Demo Visitor', email: 'visitor@example.test' })
  } else {
    await page.getByLabel('Password', { exact: true }).fill('a memorable testing passphrase')
    await page.getByLabel('Confirm password').fill('a different testing passphrase')
    await page.getByRole('button', { name: 'Show password' }).click()
    await expect(page.getByLabel('Password', { exact: true })).toHaveAttribute('type', 'text')
    await page.getByRole('button', { name: 'Hide password' }).click()
    await expect(page.getByLabel('Password', { exact: true })).toHaveAttribute('type', 'password')
    await page.getByRole('button', { name: 'Create account', exact: true }).click()
    await expect(page.getByText('Passwords must match.')).toBeVisible()
    await page.getByLabel('Confirm password').fill('a memorable testing passphrase')
    await page.route('**/api/auth/signup', async route => {
      expect(route.request().postDataJSON()).toEqual({ name: 'Demo Visitor', email: 'visitor@example.test', password: 'a memorable testing passphrase' })
      await route.fulfill({ json: { data: { ...profile, name: 'Demo Visitor', email: 'visitor@example.test' } }, status: 201 })
    })
    await page.route('**/api/clients', route => route.fulfill({ json: { data: [] } }))
    await page.getByRole('button', { name: 'Create account', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()
    await expect(page.getByText('Your account is ready.', { exact: false })).toBeVisible()
  }
})

test('Sign in reports errors without losing entered fields', async ({ page }) => {
  test.skip(demo, 'The public demo uses local profiles rather than credentials.')
  await page.route('**/api/**', route => route.fulfill(new URL(route.request().url()).pathname.endsWith('/csrf')
    ? { json: { data: { token: 'a'.repeat(64) } } }
    : { status: 401, json: { error: { code: 'INVALID_LOGIN', message: 'Email or password is incorrect.', fieldErrors: {} } } }))
  await page.goto('/login')
  await page.getByLabel('Work email').fill('visitor@example.test')
  await page.getByLabel('Password', { exact: true }).fill('a memorable testing passphrase')
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page.locator('form').getByRole('alert')).toContainText('Email or password is incorrect.')
  await expect(page.getByLabel('Work email')).toHaveValue('visitor@example.test')
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeEnabled()
})
