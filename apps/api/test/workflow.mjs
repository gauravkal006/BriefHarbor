import assert from 'node:assert/strict'
import test from 'node:test'
import { randomUUID } from 'node:crypto'

const base = process.env.API_TEST_ORIGIN ?? 'http://127.0.0.1:' + (process.env.PORT ?? 4000)
const origin = process.env.WEB_ORIGIN ?? 'http://localhost:3000'
class Actor {
  cookie = ''
  async call(path, body, expected = 200, method = body === undefined ? 'GET' : 'POST', extra = {}) {
    const headers = { Origin: origin, Cookie: this.cookie, ...extra }
    if (body !== undefined) {
      const token = await this.call('/auth/csrf')
      headers['X-CSRF-Token'] = token.token
      headers['Content-Type'] = 'application/json'
      headers.Cookie = this.cookie
    }
    const response = await fetch(base + '/api' + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) })
    if (response.headers.get('set-cookie')) this.cookie = response.headers.get('set-cookie').split(';')[0]
    const result = response.headers.get('content-type')?.includes('application/json') ? await response.json() : await response.text()
    assert.equal(response.status, expected, method + ' ' + path + ' ' + JSON.stringify(result))
    return result.data ?? result
  }
  async login(role) {
    return this.call('/auth/login', { email: role + '@' + (role === 'viewer' ? 'bluedune' : 'riverstone') + '.example.test', password: process.env.DEMO_PASSWORD })
  }
}
test('Revision integrity, named review, export, delivery retries, evidence follow-up and closure', async () => {
  assert.match(process.env.MONGODB_DB ?? '', /^briefharbor_(dev|test)(_[a-z0-9]+)*$/)
  const coordinator = new Actor(), pr = new Actor(), legal = new Actor(), factOwner = new Actor(), viewer = new Actor(), clientReviewer = new Actor()
  const [author, prUser, legalUser, factUser] = await Promise.all([coordinator.login('coordinator'), pr.login('pr'), legal.login('legal'), factOwner.login('facts'), viewer.login('viewer'), clientReviewer.login('client')])
  const [client] = await coordinator.call('/clients')
  const input = { clientId: client.id, title: 'Workflow ' + randomUUID(), type: 'DATA_BREACH', severity: 'HIGH',
    ownerId: author.id, nextUpdateAt: new Date(Date.now() + 3600000).toISOString() }
  const item = await coordinator.call('/cases', input, 201)
  const path = '/cases/' + item.id
  for (const member of client.members.filter(row => ['PR_LEAD','LEGAL_REVIEWER','CLIENT_REVIEWER'].some(role => row.roles.includes(role)))) {
    await coordinator.call(path + '/assignments', { userId: member.id, role: member.roles[0] })
  }
  const fact = await coordinator.call(path + '/facts', { claim: 'Portal restricted.', source: 'Synthetic security log', ownerId: factUser.id, visibility: 'INTERNAL' }, 201)
  await factOwner.call(path + '/facts/' + fact.id, { status: 'VERIFIED', visibility: 'SHAREABLE' }, 200, 'PATCH')
  const statement = await coordinator.call(path + '/statements', { audience: 'Public' }, 201)
  const draft = await coordinator.call('/statements/' + statement.id + '/draft', { text: 'The portal is restricted.', expectedVersion: 0 }, 200, 'PATCH')
  await coordinator.call('/statements/' + statement.id + '/draft', { text: 'Stale edit', expectedVersion: 0 }, 409, 'PATCH')
  const submission = { expectedVersion: draft.draftVersion, factVersionIds: [fact.id], reviewers: [
    { userId: prUser.id, role: 'PR_LEAD' }, { userId: legalUser.id, role: 'LEGAL_REVIEWER' },
  ] }
  await coordinator.call('/statements/' + statement.id + '/revisions', { ...submission, reviewers: [{ userId: author.id, role: 'PR_LEAD' }, submission.reviewers[1]] }, 409)
  await coordinator.call('/statements/' + statement.id + '/revisions', { ...submission, factVersionIds: ['ffffffffffffffffffffffff'] }, 409)
  const revision = await coordinator.call('/statements/' + statement.id + '/revisions', submission, 201)
  await coordinator.call('/revisions/' + revision.id + '/exports', {}, 409)
  await coordinator.call('/revisions/' + revision.id + '/decisions', { decision: 'APPROVE' }, 403)
  await viewer.call('/statements/' + statement.id, undefined, 404)
  await viewer.call(path + '/workflow', undefined, 404)
  await viewer.call(path + '/report', undefined, 404)
  await legal.call('/revisions/' + revision.id + '/decisions', { decision: 'REQUEST_CHANGES' }, 422)
  await legal.call('/revisions/' + revision.id + '/decisions', { decision: 'REQUEST_CHANGES', comment: 'Add the next update time.' })
  await pr.call('/revisions/' + revision.id + '/decisions', { decision: 'APPROVE' }, 409)
  const newerDraft = await coordinator.call('/statements/' + statement.id + '/draft', { text: 'The portal is restricted. An update follows shortly.', expectedVersion: draft.draftVersion + 1 }, 200, 'PATCH')
  const newer = await coordinator.call('/statements/' + statement.id + '/revisions', { ...submission, expectedVersion: newerDraft.draftVersion }, 201)
  await legal.call('/revisions/' + revision.id + '/decisions', { decision: 'APPROVE' }, 409)
  await Promise.all([
    pr.call('/revisions/' + newer.id + '/decisions', { decision: 'APPROVE' }),
    legal.call('/revisions/' + newer.id + '/decisions', { decision: 'APPROVE' }),
  ])
  await pr.call('/revisions/' + newer.id + '/decisions', { decision: 'APPROVE' }, 409)
  const text = await coordinator.call('/revisions/' + newer.id + '/exports', {})
  assert.equal(text, newerDraft.draft)
  const history = await coordinator.call('/statements/' + statement.id)
  assert.equal(history.revisions.find(row => row.id === revision.id).text, draft.draft)
  assert.equal(history.revisions.length, 2)
  const delivery = { revisionId: newer.id, audience: 'Press list', channel: 'EMAIL', sentAt: new Date().toISOString() }
  const key = randomUUID()
  const [first, retry] = await Promise.all([
    coordinator.call(path + '/deliveries', delivery, 201, 'POST', { 'Idempotency-Key': key }),
    coordinator.call(path + '/deliveries', delivery, 201, 'POST', { 'Idempotency-Key': key }),
  ])
  assert.equal(first.id, retry.id)
  await coordinator.call(path + '/deliveries', { ...delivery, audience: 'Changed' }, 409, 'POST', { 'Idempotency-Key': key })
  await factOwner.call(path + '/facts/' + fact.id + '/evidence', { action: 'SUPERSEDE', reason: 'Updated incident assessment', claim: 'Portal reopened.', source: 'Synthetic log 2' })
  await coordinator.call('/revisions/' + newer.id + '/exports', {}, 409)
  const workflow = await coordinator.call(path + '/workflow')
  assert.equal(workflow.deliveries[0].followUp, true)
  const historical = await coordinator.call(path + '/deliveries', { ...delivery, audience: 'Historical send' }, 201, 'POST', { 'Idempotency-Key': randomUUID() })
  assert.equal(historical.followUp, true)
  assert.ok((await coordinator.call(path + '/report')).includes('FOLLOW-UP REQUIRED'))
  const task = await coordinator.call(path + '/tasks', { title: 'Follow up with recipients', assigneeId: author.id, deadlineAt: new Date(Date.now() - 1000).toISOString() }, 201)
  await legal.call(path + '/tasks/' + task.id, { status: 'DONE' }, 403, 'PATCH')
  await coordinator.call(path + '/tasks/' + task.id, { status: 'DONE' }, 200, 'PATCH')
  await coordinator.call(path, { status: 'CLOSED', reason: 'Complete' }, 403, 'PATCH')
  await pr.call(path, { status: 'CLOSED', reason: 'All immediate work completed.' }, 200, 'PATCH')
  await coordinator.call(path + '/tasks', { title: 'Too late', assigneeId: author.id, deadlineAt: new Date().toISOString() }, 409)
  await pr.call(path, { status: 'ACTIVE', reason: 'New information received.' }, 200, 'PATCH')
  assert.equal((await coordinator.call(path)).status, 'ACTIVE')
})

test('Concurrent submission has one winner and evidence restriction serializes with export', async () => {
  const coordinator = new Actor(), pr = new Actor(), legal = new Actor(), owner = new Actor()
  const [author, prUser, legalUser, factUser] = await Promise.all([coordinator.login('coordinator'), pr.login('pr'), legal.login('legal'), owner.login('facts')])
  const [client] = await coordinator.call('/clients')
  // Seeded case has assignments for all review roles.
  const item = (await coordinator.call('/cases?clientId=' + client.id)).find(row => row.id === '00000000000000000000012d')
  assert.ok(item)
  const path = '/cases/' + item.id
  const fact = await coordinator.call(path + '/facts', { claim: 'Concurrency evidence', source: 'Synthetic log', ownerId: factUser.id, visibility: 'SHAREABLE' }, 201)
  await owner.call(path + '/facts/' + fact.id, { status: 'VERIFIED' }, 200, 'PATCH')
  const statement = await coordinator.call(path + '/statements', { audience: 'Concurrency ' + randomUUID() }, 201)
  await coordinator.call('/statements/' + statement.id + '/draft', { text: 'Concurrency release.', expectedVersion: 0 }, 200, 'PATCH')
  const body = { expectedVersion: 1, factVersionIds: [fact.id], reviewers: [{ userId: prUser.id, role: 'PR_LEAD' }, { userId: legalUser.id, role: 'LEGAL_REVIEWER' }] }
  // Capture both statuses directly while retaining each session's CSRF token.
  const token = await coordinator.call('/auth/csrf')
  const submit = () => fetch(base + '/api/statements/' + statement.id + '/revisions', { method: 'POST',
    headers: { Cookie: coordinator.cookie, Origin: origin, 'X-CSRF-Token': token.token, 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const responses = await Promise.all([submit(), submit()])
  assert.deepEqual(responses.map(row => row.status).sort(), [201, 409])
  const success = responses.find(row => row.status === 201)
  const revision = (await success.json()).data
  await Promise.all([pr.call('/revisions/' + revision.id + '/decisions', { decision: 'APPROVE' }), legal.call('/revisions/' + revision.id + '/decisions', { decision: 'APPROVE' })])
  const exportToken = await coordinator.call('/auth/csrf')
  const [exported] = await Promise.all([
    fetch(base + '/api/revisions/' + revision.id + '/exports', { method: 'POST', headers: { Cookie: coordinator.cookie, Origin: origin, 'X-CSRF-Token': exportToken.token } }),
    owner.call(path + '/facts/' + fact.id + '/evidence', { action: 'RESTRICT', reason: 'Concurrent privacy restriction' }),
  ])
  assert.ok([200, 409].includes(exported.status))
  await coordinator.call('/revisions/' + revision.id + '/exports', {}, 409)
  const session = await coordinator.call('/auth/session')
  assert.equal(session.id, author.id)
})

test('Lawsuit, executive and sensitive-event templates enforce named reviewer policies', async () => {
  const coordinator = new Actor(), pr = new Actor(), legal = new Actor(), factOwner = new Actor(), client = new Actor()
  const [, prUser, legalUser, factUser, clientUser] = await Promise.all([
    coordinator.login('coordinator'), pr.login('pr'), legal.login('legal'), factOwner.login('facts'), client.login('client'),
  ])
  const scenarios = [
    { id: '00000000000000000000012f', clientReview: false },
    { id: '000000000000000000000130', clientReview: true },
    { id: '000000000000000000000131', clientReview: false },
  ]
  for (const scenario of scenarios) {
    const path = '/cases/' + scenario.id
    const fact = await coordinator.call(path + '/facts', { claim: 'Verified scenario evidence ' + randomUUID(), source: 'Synthetic incident reference', ownerId: factUser.id, visibility: 'SHAREABLE' }, 201)
    await factOwner.call(path + '/facts/' + fact.id, { status: 'VERIFIED' }, 200, 'PATCH')
    const statement = await coordinator.call(path + '/statements', { audience: 'Scenario release' }, 201)
    await coordinator.call('/statements/' + statement.id + '/draft', { text: 'Confirmed scenario facts.', expectedVersion: 0 }, 200, 'PATCH')
    const reviewers = [{ userId: prUser.id, role: 'PR_LEAD' }, { userId: legalUser.id, role: 'LEGAL_REVIEWER' }]
    if (scenario.clientReview) reviewers.push({ userId: clientUser.id, role: 'CLIENT_REVIEWER' })
    const body = { expectedVersion: 1, factVersionIds: [fact.id], reviewers }
    await coordinator.call('/statements/' + statement.id + '/revisions', { ...body, reviewers: reviewers.slice(0, -1) }, 409)
    const revision = await coordinator.call('/statements/' + statement.id + '/revisions', body, 201)
    await pr.call('/revisions/' + revision.id + '/decisions', { decision: 'APPROVE' })
    await legal.call('/revisions/' + revision.id + '/decisions', { decision: 'APPROVE' })
    if (scenario.clientReview) {
      await coordinator.call('/revisions/' + revision.id + '/exports', {}, 409)
      await client.call('/revisions/' + revision.id + '/decisions', { decision: 'APPROVE' })
    }
    assert.equal(await coordinator.call('/revisions/' + revision.id + '/exports', {}), 'Confirmed scenario facts.')
  }
})
