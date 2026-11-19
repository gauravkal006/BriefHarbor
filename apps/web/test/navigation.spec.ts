import { expect, test } from '@playwright/test'
import { demoCase, demoClient, demoSummary, profile } from '../src/lib/fixture'

test('Workspace navigation using the typed synthetic fixture', async ({ page }) => {
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname
    const responses: Record<string, unknown> = {
      '/api/auth/session': profile, '/api/clients': [demoClient],
      '/api/cases': [demoSummary],
      ['/api/cases/' + demoCase.id + '/workflow']: {
        statements: [], revisions: [], tasks: [], deliveries: [], timeline: [],
        members: demoCase.members, status: demoCase.status, sensitiveClaims: false, personnelStatement: false,
      }, ['/api/cases/' + demoCase.id]: demoCase,
    }
    const data = responses[path]
    await route.fulfill(data === undefined ? {
      status: 404, json: { error: { code: 'NOT_FOUND', message: 'Record unavailable', fieldErrors: {} } },
    } : { json: { data } })
  })
  await page.goto('/dashboard')
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()
  await page.getByRole('link', { name: 'View all cases' }).click()
  await expect(page.getByRole('heading', { name: 'Case register' })).toBeVisible()
  await page.getByRole('link', { name: demoCase.title }).click()
  await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible()
  await page.getByRole('button', { name: 'Facts', exact: true }).click()
  await expect(page.getByText('No facts have been recorded.')).toBeVisible()
  await page.getByRole('button', { name: 'Media Inquiries' }).click()
  await expect(page.getByText('No media inquiries have been recorded.')).toBeVisible()
  await page.getByRole('link', { name: 'Cases', exact: true }).last().click()
  await page.getByRole('link', { name: 'New case' }).click()
  await expect(page.getByRole('heading', { name: 'New case' })).toBeVisible()
})
