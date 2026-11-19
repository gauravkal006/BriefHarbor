import assert from 'node:assert/strict'
import test from 'node:test'
import { randomUUID } from 'node:crypto'
import { MongoClient } from 'mongodb'
import { verify } from 'argon2'

test('Registration rotates sessions, persists hashed credentials and grants no client access', async () => {
  assert.match(process.env.MONGODB_DB ?? '', /^briefharbor_test(?:_[a-z0-9]+)*$/, 'Use a dedicated test database.')
  const base = process.env.API_TEST_ORIGIN ?? 'http://127.0.0.1:' + (process.env.PORT ?? 4000)
  const origin = process.env.WEB_ORIGIN ?? 'http://localhost:3000'
  const mongo = new MongoClient(process.env.MONGODB_URI)
  const email = 'signup-' + randomUUID() + '@example.test'
  const body = { name: '  New Teammate  ', email: email.toUpperCase(), password: 'a private testing passphrase' }
  let cookie = ''
  async function request(path, { method = 'GET', data, token, status = 200, from = origin } = {}) {
    const response = await fetch(base + '/api' + path, { method, headers: {
      Origin: from, Cookie: cookie,
      ...(data ? { 'Content-Type': 'application/json' } : {}), ...(token ? { 'X-CSRF-Token': token } : {}),
    }, body: data ? JSON.stringify(data) : undefined })
    const nextCookie = response.headers.get('set-cookie')
    if (nextCookie) cookie = nextCookie.split(';')[0]
    const result = await response.json()
    assert.equal(response.status, status, method + ' ' + path + ' ' + JSON.stringify(result))
    return result.data
  }
  const token = async () => (await request('/auth/csrf')).token
  const signup = async (data, status) => request('/auth/signup', { method: 'POST', token: await token(), data, status })
  try {
    await request('/auth/signup', { method: 'POST', data: body, status: 403 })
    await request('/auth/signup', { method: 'POST', data: body, token: await token(), from: 'https://foreign.example.test', status: 403 })
    await signup({ ...body, password: 'short' }, 422)
    await signup({ ...body, roles: ['PR_LEAD'] }, 422)
    const before = cookie
    const beforeToken = await token()
    const account = await signup(body, 201)
    assert.notEqual(cookie, before)
    assert.notEqual(await token(), beforeToken)
    assert.equal(account.name, 'New Teammate')
    assert.equal(account.email, email)
    assert.deepEqual(await request('/auth/session'), account)
    assert.deepEqual(await request('/clients'), [])
    await request('/cases/00000000000000000000012d', { status: 404 })
    await request('/cases?clientId=000000000000000000000065', { status: 404 })
    await signup({ ...body, email }, 409)
    const db = mongo.db(process.env.MONGODB_DB)
    const stored = await db.collection('users').findOne({ email })
    assert.ok(stored)
    assert.notEqual(stored.passwordHash, body.password)
    assert.ok(await verify(stored.passwordHash, body.password))
    assert.equal(await db.collection('users').countDocuments({ email }), 1)
    assert.equal(await db.collection('memberships').countDocuments({ userId: stored._id }), 0)
    assert.equal(await db.collection('caseAssignments').countDocuments({ userId: stored._id }), 0)
    const signedInCookie = cookie
    await request('/auth/logout', { method: 'POST', token: await token(), data: {} })
    cookie = signedInCookie
    await request('/auth/session', { status: 401 })
    cookie = ''
    await request('/auth/login', { method: 'POST', token: await token(), data: { email, password: 'wrong passphrase' }, status: 401 })
    assert.deepEqual(await request('/auth/login', { method: 'POST', token: await token(), data: { email, password: body.password } }), account)
    await request('/auth/logout', { method: 'POST', token: await token(), data: {} })
  } finally {
    const db = mongo.db(process.env.MONGODB_DB)
    const stored = await db.collection('users').findOne({ email })
    if (stored) {
      await db.collection('sessions').deleteMany({ 'data.userId': stored._id.toHexString() })
      await db.collection('users').deleteOne({ _id: stored._id })
    }
    await mongo.close()
  }
})
