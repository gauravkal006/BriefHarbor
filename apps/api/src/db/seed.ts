import { hash } from 'argon2'
import { ObjectId } from 'mongodb'
import { config } from '../config.js'
import { connect, type Case } from './index.js'
import type { Role } from '@briefharbor/contracts'

const password = process.env.DEMO_PASSWORD
if (process.env.NODE_ENV !== 'development' || process.env.ALLOW_DEMO_SEED !== 'true' || !password || password.length < 12 || password.length > 256) {
  throw new Error('Demo seed requires NODE_ENV=development, ALLOW_DEMO_SEED=true and a local DEMO_PASSWORD of 12–256 characters.')
}
const options = config()
if (!/^briefharbor_(dev|test)(_[a-z0-9]+)*$/.test(options.dbName)) {
  throw new Error('Demo seed requires a briefharbor_dev or briefharbor_test database name.')
}

const id = (number: number) => new ObjectId(number.toString(16).padStart(24, '0'))
const riverstone = id(101)
const blueDune = id(102)
const demoUsers: { _id: ObjectId; name: string; email: string; clientId: ObjectId; role: Role }[] = [
  { _id: id(201), name: 'Maya Chen', email: 'coordinator@riverstone.example.test', clientId: riverstone, role: 'COORDINATOR' },
  { _id: id(202), name: 'Ellis Morgan', email: 'pr@riverstone.example.test', clientId: riverstone, role: 'PR_LEAD' },
  { _id: id(203), name: 'Samira Bell', email: 'legal@riverstone.example.test', clientId: riverstone, role: 'LEGAL_REVIEWER' },
  { _id: id(204), name: 'Dev Patel', email: 'facts@riverstone.example.test', clientId: riverstone, role: 'FACT_OWNER' },
  { _id: id(206), name: 'Robin Taylor', email: 'client@riverstone.example.test', clientId: riverstone, role: 'CLIENT_REVIEWER' },
  { _id: id(205), name: 'Alex Jordan', email: 'viewer@bluedune.example.test', clientId: blueDune, role: 'VIEWER' },
]
const now = new Date()
const offset = (minutes: number) => new Date(now.getTime() + minutes * 60_000)
const breach: Case = {
  _id: id(301), clientId: riverstone, title: 'Customer portal access restriction', type: 'DATA_BREACH',
  severity: 'HIGH', status: 'ACTIVE', ownerId: id(201), nextUpdateAt: offset(45), createdAt: now, workflowVersion: 0, synthetic: true,
}
const event: Case = {
  _id: id(302), clientId: blueDune, title: 'Distribution centre access disruption', type: 'HOSTILE_PUBLIC_EVENT',
  severity: 'MEDIUM', status: 'MONITORING', ownerId: id(205), nextUpdateAt: offset(120), createdAt: now, workflowVersion: 0, synthetic: true,
}
const additional: Case[] = [
  { ...breach, _id: id(303), title: 'Supplier litigation response', type: 'LAWSUIT', status: 'NEW' },
  { ...breach, _id: id(304), title: 'Executive conduct inquiry', type: 'EXECUTIVE_SCANDAL', status: 'NEW', personnelStatement: true },
  { ...breach, _id: id(305), title: 'Flagship store event disruption', type: 'HOSTILE_PUBLIC_EVENT', status: 'NEW', sensitiveClaims: true },
]
const passwordHash = await hash(password)
const db = await connect(options)
try {
  await db.client.withSession(session => session.withTransaction(async () => {
    const upsert = { upsert: true, session }
    for (const client of [{ _id: riverstone, name: 'Riverstone Retail' }, { _id: blueDune, name: 'Blue Dune Logistics' }]) {
      await db.clients.updateOne({ _id: client._id }, { $setOnInsert: { ...client, synthetic: true } }, upsert)
    }
    for (const item of [breach, event, ...additional]) {
      await db.cases.updateOne({ _id: item._id }, { $setOnInsert: item }, upsert)
    }
    for (const { _id, name, email, clientId, role } of demoUsers) {
      await db.users.updateOne({ _id }, { $setOnInsert: { _id, name, email, active: true }, $set: { passwordHash } }, upsert)
      await db.members.updateOne({ clientId, userId: _id }, { $setOnInsert: { clientId, userId: _id, roles: [role], active: true } }, upsert)
      for (const item of clientId.equals(riverstone) ? [breach, ...additional] : [event]) {
        const claim = { caseId: item._id, clientId, userId: _id, role }
        await db.assignments.updateOne(claim, { $setOnInsert: claim }, upsert)
      }
    }
    const scope = { clientId: riverstone, caseId: breach._id }
    for (const record of [
      { _id: id(401), claim: 'The customer portal was restricted while the security team investigated.', source: 'Security incident log BH-001' },
      { _id: id(402), claim: 'The team has yet to determine whether customer records were affected.', source: 'Incident assessment BH-002' },
    ]) {
      await db.facts.updateOne({ _id: record._id }, { $setOnInsert: {
        ...scope, ...record, logicalFactId: record._id, version: 1, ownerId: id(204), status: 'UNVERIFIED',
        visibility: 'INTERNAL', verifierId: null, verifiedAt: null, createdAt: now,
      } }, upsert)
    }
    for (const record of [
      { _id: id(501), outlet: 'The Market Ledger', contact: 'desk@marketledger.example.test',
        question: 'Why is the customer portal restricted, and when will the next update be available?', deadlineAt: offset(30) },
      { _id: id(502), outlet: 'Metro Commerce Wire', contact: 'editor@metrocommerce.example.test',
        question: 'Can you confirm which services are affected?', deadlineAt: offset(-15) },
    ]) {
      await db.inquiries.updateOne({ _id: record._id }, { $setOnInsert: {
        ...scope, ...record, ownerId: id(201), status: 'OPEN', closureReason: null, createdAt: now,
      } }, upsert)
    }
  }))
  console.log('Seeded Riverstone Retail and Blue Dune Logistics.')
} finally { await db.client.close() }
