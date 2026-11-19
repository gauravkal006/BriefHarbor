import assert from 'node:assert/strict'
import test from 'node:test'
import { demoApi, readDemoCases, resetDemo, setDemoRole } from '../src/lib/demo-api.ts'
import { demoWorkflowApi as flow } from '../src/lib/demo-workflow.ts'
import { demoProfile, registration, registrationForm, reviewerPolicy } from '@briefharbor/contracts'

function storage() {
  const state = new Map()
  return { getItem: key => state.get(key) ?? null, setItem: (key, value) => state.set(key, value), removeItem: key => state.delete(key) }
}
Object.defineProperty(globalThis, 'localStorage', { value: storage(), configurable: true })
Object.defineProperty(globalThis, 'sessionStorage', { value: storage(), configurable: true })

test('Demo profiles persist without credentials and retain separate reviewer identities', async () => {
  resetDemo()
  const guest = await demoApi.session()
  const cases = readDemoCases()
  setDemoRole('legal')
  const visitor = await demoApi.signup({ name: '  Demo Visitor  ', email: 'Visitor@Example.test', password: 'never-store-this-secret' })
  assert.deepEqual(visitor, { ...guest, name: 'Demo Visitor', email: 'visitor@example.test' })
  assert.deepEqual(await demoApi.session(), visitor)
  assert.deepEqual(readDemoCases(), cases)
  const stored = localStorage.getItem('briefharbor.demo-profile.v1')
  assert.deepEqual(JSON.parse(stored), { name: 'Demo Visitor', email: 'visitor@example.test' })
  assert.ok(!stored.includes('never-store-this-secret'))
  setDemoRole('legal')
  assert.notEqual((await demoApi.session()).id, visitor.id)
  setDemoRole('coordinator')
  assert.deepEqual(await demoApi.session(), visitor)
  await assert.rejects(demoApi.signup({ name: ' ', email: 'broken' }), { status: 422 })
  assert.deepEqual(await demoApi.session(), visitor)
  await demoApi.logout()
  assert.deepEqual(await demoApi.session(), guest)
  localStorage.setItem('briefharbor.demo-profile.v1', '{broken')
  assert.deepEqual(await demoApi.session(), guest)
  resetDemo()
})

test('Registration rejects short, mismatched and privilege-bearing submissions', () => {
  const valid = { name: '  Example Visitor  ', email: 'visitor@example.test', password: 'a long memorable passphrase' }
  assert.equal(registration.parse(valid).name, 'Example Visitor')
  for (const extra of [{ name: ' ' }, { email: 'broken' }, { password: 'short' }, { password: 'x'.repeat(257) }, { roles: ['PR_LEAD'] }, { clientId: '000000000000000000000065' }]) {
    assert.equal(registration.safeParse({ ...valid, ...extra }).success, false)
  }
  assert.equal(registrationForm.safeParse({ ...valid, confirmPassword: 'different' }).success, false)
  assert.equal(registrationForm.safeParse({ ...valid, confirmPassword: valid.password }).success, true)
  assert.equal(demoProfile.safeParse({ name: valid.name, email: valid.email }).success, true)
  assert.equal(demoProfile.safeParse(valid).success, false)
})

test('Full browser-local workflow preserves revisions and blocks export after evidence changes', async () => {
  resetDemo()
  const record = readDemoCases()[0], fact = record.facts[0]
  await assert.rejects(demoApi.verify(record.id, fact.id, true), { status: 403 })
  setDemoRole('analyst')
  await demoApi.verify(record.id, fact.id, true)
  setDemoRole('coordinator')
  const statement = await flow.createStatement(record.id, { audience: 'Public' })
  await flow.saveDraft(statement.id, { text: 'The portal is restricted.', expectedVersion: 0 })
  const members = record.members
  const pr = members.find(row => row.roles.includes('PR_LEAD'))
  const legal = members.find(row => row.roles.includes('LEGAL_REVIEWER'))
  const submission = { expectedVersion: 1, factVersionIds: [fact.id], reviewers: [
    { userId: pr.id, role: 'PR_LEAD' }, { userId: legal.id, role: 'LEGAL_REVIEWER' },
  ] }
  const revision = await flow.submit(statement.id, submission)
  await assert.rejects(flow.submit(statement.id, submission), { status: 409 })
  await assert.rejects(flow.export(revision.id), { status: 409 })
  await assert.rejects(flow.decide(revision.id, { decision: 'APPROVE' }), { status: 403 })
  setDemoRole('legal')
  await assert.rejects(flow.decide(revision.id, { decision: 'REQUEST_CHANGES', comment: '' }), { status: 422 })
  await flow.decide(revision.id, { decision: 'REQUEST_CHANGES', comment: 'Clarify timing.' })
  setDemoRole('pr')
  await assert.rejects(flow.decide(revision.id, { decision: 'APPROVE' }), { status: 409 })
  setDemoRole('coordinator')
  await flow.saveDraft(statement.id, { text: 'The portal is restricted. Updates follow.', expectedVersion: 2 })
  const newer = await flow.submit(statement.id, { ...submission, expectedVersion: 3 })
  assert.equal((await flow.statement(statement.id)).revisions.find(row => row.id === revision.id).text, 'The portal is restricted.')
  setDemoRole('pr')
  await assert.rejects(flow.decide(revision.id, { decision: 'APPROVE' }), { status: 409 })
  await flow.decide(newer.id, { decision: 'APPROVE', comment: '' })
  setDemoRole('legal')
  await flow.decide(newer.id, { decision: 'APPROVE', comment: '' })
  setDemoRole('coordinator')
  assert.equal(await flow.export(newer.id), newer.text)
  const delivery = { revisionId: newer.id, audience: 'Newsroom', sentAt: new Date().toISOString(), channel: 'EMAIL' }
  const first = await flow.deliver(record.id, delivery, 'demo-delivery-01')
  assert.equal((await flow.deliver(record.id, delivery, 'demo-delivery-01')).id, first.id)
  await assert.rejects(flow.deliver(record.id, { ...delivery, audience: 'Other' }, 'demo-delivery-01'), { status: 409 })
  setDemoRole('analyst')
  await flow.evidence(record.id, fact.id, { action: 'RESTRICT', reason: 'Check disclosure' })
  setDemoRole('coordinator')
  await assert.rejects(flow.export(newer.id), { status: 409 })
  setDemoRole('analyst')
  await flow.evidence(record.id, fact.id, { action: 'SHARE', reason: 'Disclosure cleared' })
  setDemoRole('coordinator')
  assert.equal(await flow.export(newer.id), newer.text)
  assert.equal((await flow.workflow(record.id)).deliveries[0].followUp, true)
  setDemoRole('analyst')
  await flow.evidence(record.id, fact.id, { action: 'SUPERSEDE', reason: 'Reassessment', claim: 'Portal reopened.', source: 'Incident log 2' })
  setDemoRole('coordinator')
  await assert.rejects(flow.export(newer.id), { status: 409 })
  assert.equal((await flow.workflow(record.id)).deliveries[0].followUp, true)
  assert.equal((await flow.deliver(record.id, { ...delivery, audience: 'Later recorded send' }, 'demo-delivery-02')).followUp, true)
  assert.ok((await flow.report(record.id)).includes('FACT_SUPERSEDED'))
  const task = await flow.addTask(record.id, { title: 'Follow up', assigneeId: (await demoApi.session()).id, deadlineAt: new Date().toISOString() })
  await flow.editTask(record.id, task.id, { status: 'DONE' })
  setDemoRole('pr')
  await assert.rejects(flow.changeCase(record.id, { status: 'CLOSED', reason: 'Complete' }), { status: 409 })
  setDemoRole('coordinator')
  await demoApi.editInquiry(record.id, record.inquiries[0].id, { status: 'CLOSED_WITHOUT_RESPONSE', closureReason: 'Withdrawn by outlet' })
  setDemoRole('pr')
  await flow.changeCase(record.id, { status: 'CLOSED', reason: 'All inquiries resolved' })
  await flow.changeCase(record.id, { status: 'ACTIVE', reason: 'New evidence' })
  assert.equal((await demoApi.detail(record.id)).status, 'ACTIVE')
  resetDemo()
})

test('Scenario reviewer policies include client and conditional legal approval', () => {
  assert.deepEqual(reviewerPolicy('DATA_BREACH'), ['PR_LEAD', 'LEGAL_REVIEWER'])
  assert.deepEqual(reviewerPolicy('LAWSUIT'), ['PR_LEAD', 'LEGAL_REVIEWER'])
  assert.deepEqual(reviewerPolicy('EXECUTIVE_SCANDAL', false, true), ['PR_LEAD', 'LEGAL_REVIEWER', 'CLIENT_REVIEWER'])
  assert.deepEqual(reviewerPolicy('HOSTILE_PUBLIC_EVENT'), ['PR_LEAD'])
  assert.deepEqual(reviewerPolicy('HOSTILE_PUBLIC_EVENT', true), ['PR_LEAD', 'LEGAL_REVIEWER'])
})

