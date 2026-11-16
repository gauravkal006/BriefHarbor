import assert from 'node:assert/strict'
import test from 'node:test'
import { randomUUID } from 'node:crypto'
import { MongoClient, ObjectId } from 'mongodb'

const base = process.env.API_TEST_ORIGIN ?? 'http://127.0.0.1:' + (process.env.PORT ?? 4000)
const origin = process.env.WEB_ORIGIN ?? 'http://localhost:3000'
const password = process.env.DEMO_PASSWORD
const email = {
  coordinator: 'coordinator@riverstone.example.test',
  facts: 'facts@riverstone.example.test',
  viewer: 'viewer@bluedune.example.test',
}

class Browser {
  cookie = ''
  async request(path, { method = 'GET', token, body, status = 200, requestOrigin = origin } = {}) {
    const headers = { Origin: requestOrigin }
    if (this.cookie) headers.Cookie = this.cookie
    if (token) headers['X-CSRF-Token'] = token
    if (body !== undefined) headers['Content-Type'] = 'application/json'
    const res = await fetch(base + '/api' + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) })
    const rawCookie = res.headers.get('set-cookie')
    if (rawCookie) this.cookie = rawCookie.split(';')[0]
    const json = await res.json()
    assert.equal(res.status, status, method + ' ' + path + ' ' + JSON.stringify(json))
    return { ...json, cookie: rawCookie }
  }
  async token() { return (await this.request('/auth/csrf')).data.token }
  async login(address) {
    const token = await this.token()
    const original = this.cookie
    const { data, cookie } = await this.request('/auth/login', { method: 'POST', token, body: { email: address, password } })
    assert.notEqual(this.cookie, original)
    assert.match(cookie, /HttpOnly/i)
    assert.match(cookie, /SameSite=Lax/i)
    return data
  }
  async change(path, body, status = 201, method = 'POST') {
    return this.request(path, { method, body, token: await this.token(), status })
  }
}

test('Persisted case workflow, session security, membership and nested record boundaries', async () => {
  assert.ok(password, 'Seed the local development database and set DEMO_PASSWORD first.')
  await new Browser().request('/health/ready')
  const anonymous = new Browser()
  await anonymous.request('/cases/00000000000000000000012d', { status: 401 })
  await anonymous.request('/auth/login', { method: 'POST', body: { email: email.coordinator, password }, status: 403 })
  const token = await anonymous.token()
  await anonymous.request('/auth/login', { method: 'POST', token, requestOrigin: 'https://foreign.example.test',
    body: { email: email.coordinator, password }, status: 403 })
  await anonymous.change('/auth/login', { email: email.coordinator, password: 'invalid-password' }, 401)

  const coordinator = new Browser()
  const owner = await coordinator.login(email.coordinator)
  const [client] = (await coordinator.request('/clients')).data
  assert.equal(client.name, 'Riverstone Retail')
  const factOwner = client.members.find(member => member.roles.includes('FACT_OWNER'))
  assert.ok(factOwner)
  const before = new Browser()
  before.cookie = coordinator.cookie
  assert.equal((await before.request('/auth/session')).data.id, owner.id)

  const payload = { clientId: client.id, title: 'API check ' + randomUUID(), type: 'DATA_BREACH',
    severity: 'HIGH', ownerId: owner.id, nextUpdateAt: new Date(Date.now() + 3600_000).toISOString() }
  const invalid = await coordinator.change('/cases', { ...payload, title: ' ' }, 422)
  assert.ok(invalid.error.fieldErrors.title)
  const first = (await coordinator.change('/cases', payload)).data
  const second = (await coordinator.change('/cases', { ...payload, title: payload.title + ' second' })).data
  const path = '/cases/' + first.id
  const secondPath = '/cases/' + second.id
  const cases = (await coordinator.request('/cases?clientId=' + client.id + '&status=NEW')).data
  assert.ok(cases.some(item => item.id === first.id))

  const fact = (await coordinator.change(path + '/facts', { claim: 'Test claim', source: 'Synthetic source',
    ownerId: factOwner.id, visibility: 'INTERNAL' })).data
  await coordinator.change(path + '/facts/' + fact.id, { status: 'VERIFIED' }, 403, 'PATCH')
  const verifier = new Browser()
  await verifier.login(email.facts)
  await verifier.change('/cases/00000000000000000000012d/facts/' + fact.id, { status: 'VERIFIED' }, 404, 'PATCH')
  await verifier.change(path + '/facts/not-an-id', { status: 'VERIFIED' }, 422, 'PATCH')
  const verified = (await verifier.change(path + '/facts/' + fact.id, { status: 'VERIFIED', visibility: 'SHAREABLE' }, 200, 'PATCH')).data
  assert.equal(verified.verifierId, factOwner.id)
  assert.equal(verified.status, 'VERIFIED')
  assert.equal(verified.visibility, 'SHAREABLE')
  await verifier.change(path + '/facts/' + fact.id, { status: 'VERIFIED' }, 409, 'PATCH')

  const inquiry = (await coordinator.change(path + '/inquiries', { outlet: 'Synthetic Desk', contact: 'desk@example.test',
    question: 'When is the next update?', ownerId: owner.id, deadlineAt: new Date(Date.now() - 60000).toISOString() })).data
  assert.equal((await coordinator.request(path)).data.nearestInquiryDeadlineAt, inquiry.deadlineAt)
  await coordinator.change(secondPath + '/inquiries/' + inquiry.id, { deadlineAt: inquiry.deadlineAt }, 404, 'PATCH')
  await coordinator.change(path + '/inquiries/bad-id', { deadlineAt: inquiry.deadlineAt }, 422, 'PATCH')
  await verifier.change(path + '/inquiries/' + inquiry.id, { deadlineAt: inquiry.deadlineAt }, 403, 'PATCH')
  const deadlineAt = new Date(Date.now() + 1800_000).toISOString()
  await coordinator.change(path + '/inquiries/' + inquiry.id, { deadlineAt }, 200, 'PATCH')
  const persisted = (await before.request(path)).data
  assert.equal(persisted.facts[0].status, 'VERIFIED')
  assert.equal(persisted.inquiries[0].deadlineAt, deadlineAt)
  await coordinator.change(path + '/inquiries/' + inquiry.id, { status: 'CLOSED_WITHOUT_RESPONSE' }, 422, 'PATCH')
  await coordinator.change(path + '/inquiries/' + inquiry.id, {
    status: 'CLOSED_WITHOUT_RESPONSE', closureReason: 'The desk withdrew its inquiry.',
  }, 200, 'PATCH')
  assert.equal((await before.request(path)).data.nearestInquiryDeadlineAt, null)

  const viewer = new Browser()
  const viewerAccount = await viewer.login(email.viewer)
  const viewerClients = (await viewer.request('/clients')).data
  assert.deepEqual(viewerClients.map(item => item.name), ['Blue Dune Logistics'])
  await viewer.request('/cases?clientId=' + client.id, { status: 404 })
  await viewer.request(path, { status: 404 })
  await viewer.change(path + '/inquiries/' + inquiry.id, { deadlineAt }, 404, 'PATCH')
  const [blueCase] = (await viewer.request('/cases?clientId=' + viewerClients[0].id)).data
  await coordinator.request('/cases/' + blueCase.id, { status: 404 })
  await viewer.change('/cases', { ...payload, clientId: viewerClients[0].id, ownerId: viewerAccount.id }, 403)

  // Exercise revocation against the designated synthetic development database.
  assert.match(process.env.MONGODB_DB, /^briefharbor_(dev|test)(_[a-z0-9]+)*$/)
  const mongo = new MongoClient(process.env.MONGODB_URI)
  try {
    const memberships = mongo.db(process.env.MONGODB_DB).collection('memberships')
    const key = { clientId: new ObjectId(viewerClients[0].id), userId: new ObjectId(viewerAccount.id) }
    try {
      await memberships.updateOne(key, { $set: { active: false } })
      await viewer.request('/cases/' + blueCase.id, { status: 404 })
      assert.deepEqual((await viewer.request('/clients')).data, [])
    } finally { await memberships.updateOne(key, { $set: { active: true } }) }
  } finally { await mongo.close() }
  await coordinator.change('/auth/logout', {}, 200)
  await coordinator.request('/auth/session', { status: 401 })
  await before.request('/auth/session', { status: 401 })
})
