import { randomUUID } from 'node:crypto'
import { expect, test } from '@playwright/test'

const password = process.env.DEMO_PASSWORD
async function signIn(page, email) {
  await page.goto('/login')
  await page.getByLabel('Work email').fill(email)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()
}
async function signOut(page) {
  const menu = page.getByRole('button', { name: 'Toggle navigation' })
  if (await menu.isVisible()) await menu.click()
  await page.getByRole('button', { name: 'Sign out' }).click()
  await expect(page).toHaveURL(/\/login$/)
}
test('Coordinator intake, fact-owner verification and cross-client direct URL', async ({ page }) => {
  expect(password, 'Set DEMO_PASSWORD and run npm run seed first.').toBeTruthy()
  await signIn(page, 'coordinator@riverstone.example.test')
  await expect(page.getByText('Overdue', { exact: true }).first()).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize().width)
  await page.getByRole('link', { name: 'New case' }).click()
  const title = 'Browser intake ' + randomUUID().slice(0, 8)
  await page.getByLabel('Case title').fill(title)
  await page.getByLabel('Owner', { exact: true }).selectOption({ label: 'Maya Chen' })
  await page.getByLabel('Next update (local time)').fill('2028-01-01T12:30')
  await page.getByRole('button', { name: 'Create case' }).click()
  await expect(page.getByRole('heading', { name: title })).toBeVisible()
  const detail = page.url()

  await page.getByRole('button', { name: 'Facts', exact: true }).click()
  await page.getByText('Add fact', { exact: true }).click()
  await page.getByLabel('Claim').fill('The public portal is restricted.')
  await page.getByLabel('Source reference').fill('Synthetic response log')
  await page.getByLabel('Fact owner').selectOption({ label: 'Dev Patel' })
  await page.getByRole('button', { name: 'Save fact' }).click()
  await expect(page.getByRole('heading', { name: 'The public portal is restricted.' })).toBeVisible()

  await page.getByRole('button', { name: 'Media Inquiries' }).click()
  await page.getByText('Add inquiry', { exact: true }).click()
  await page.getByLabel('Outlet').fill('Example Business Desk')
  await page.getByLabel('Contact').fill('editor@example.test')
  await page.getByLabel('Question').fill('When will the portal reopen?')
  await page.getByLabel('Owner', { exact: true }).selectOption({ label: 'Maya Chen' })
  await page.getByLabel('Deadline (local time)').fill('2022-01-01T12:30')
  await page.getByRole('button', { name: 'Save inquiry' }).click()
  await expect(page.getByText('Overdue', { exact: true })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Example Business Desk' })).toBeVisible()
  await page.getByText('Edit inquiry', { exact: true }).click()
  const record = page.locator('article').filter({ hasText: 'Example Business Desk' })
  await record.getByLabel('Deadline (local time)').fill('2028-01-01T12:30')
  await record.getByRole('button', { name: 'Save changes' }).click()
  await expect(page.getByText('Overdue', { exact: true })).toHaveCount(0)

  await signOut(page)
  await page.goto(detail)
  await expect(page).toHaveURL(/\/login$/)
  await signIn(page, 'facts@riverstone.example.test')
  await page.goto(detail + '?view=facts')
  await page.getByLabel('Mark shareable').check()
  await page.getByRole('button', { name: 'Verify fact' }).click()
  await expect(page.getByText('Verified', { exact: true })).toBeVisible()
  await signOut(page)
  await signIn(page, 'viewer@bluedune.example.test')
  await page.goto(detail)
  await expect(page.getByRole('alert')).toContainText('This record is unavailable')
  await expect(page.getByRole('heading', { name: title })).toHaveCount(0)
})

test('Named PR and legal reviews, approved download and refresh persistence', async ({ page }) => {
  expect(password).toBeTruthy()
  await signIn(page, 'coordinator@riverstone.example.test')
  const casePath = '/cases/00000000000000000000012d'
  const change = async (path, body) => {
    const token = (await (await page.request.get('/api/auth/csrf')).json()).data.token
    const response = await page.request.post('/api' + path, { data: body, headers: {
      'X-CSRF-Token': token, Origin: process.env.WEB_ORIGIN || 'http://localhost:3000',
    } })
    expect(response.ok()).toBeTruthy()
    return (await response.json()).data
  }
  const [client] = (await (await page.request.get('/api/clients')).json()).data
  const owner = client.members.find(row => row.roles.includes('FACT_OWNER'))
  const fact = await change(casePath + '/facts', { claim: 'Browser review evidence ' + randomUUID(), source: 'Synthetic incident log',
    ownerId: owner.id, visibility: 'SHAREABLE' })
  await signOut(page)
  await signIn(page, 'facts@riverstone.example.test')
  await page.goto(casePath + '?view=facts')
  const evidence = page.locator('article').filter({ has: page.getByRole('heading', { name: fact.claim, exact: true }) })
  await evidence.getByRole('button', { name: 'Verify fact' }).click()
  await expect(evidence.getByText('Verified', { exact: true })).toBeVisible()
  await signOut(page)
  await signIn(page, 'coordinator@riverstone.example.test')
  await page.goto(casePath + '?view=workflow')
  await page.getByText('New statement', { exact: true }).click()
  const audience = 'Browser release ' + randomUUID().slice(0, 8)
  await page.getByLabel('Audience', { exact: true }).fill(audience)
  await page.getByRole('button', { name: 'Create statement', exact: true }).click()
  const editor = page.locator('.statement-editor').filter({ has: page.getByRole('heading', { name: audience, exact: true }) })
  await editor.getByLabel('Draft text').fill('The portal is restricted while the team investigates.')
  await editor.getByRole('button', { name: 'Save draft', exact: true }).click()
  await editor.getByText('Submit a new revision for review', { exact: true }).click()
  await editor.getByLabel(fact.claim, { exact: false }).check()
  await editor.getByLabel('Pr lead', { exact: true }).selectOption({ label: 'Ellis Morgan' })
  await editor.getByLabel('Legal reviewer', { exact: true }).selectOption({ label: 'Samira Bell' })
  await editor.getByRole('button', { name: 'Submit revision', exact: true }).click()
  await editor.getByRole('button', { name: 'Export approved text' }).click()
  await expect(page.getByRole('alert')).toContainText('Complete all required approvals')
  for (const role of ['pr', 'legal']) {
    await signOut(page)
    await signIn(page, role + '@riverstone.example.test')
    await page.goto(casePath + '?view=workflow')
    await editor.getByRole('button', { name: 'Record decision' }).click()
    await expect(page.getByText('Review decision recorded.', { exact: true })).toBeVisible()
  }
  await signOut(page)
  await signIn(page, 'coordinator@riverstone.example.test')
  await page.goto(casePath + '?view=workflow')
  await page.reload()
  await expect(editor.getByText('Approved', { exact: true })).toBeVisible()
  const download = page.waitForEvent('download')
  await editor.getByRole('button', { name: 'Export approved text' }).click()
  expect((await download).suggestedFilename()).toMatch(/briefharbor-release-v1/)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize().width)
})
