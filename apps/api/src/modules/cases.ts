import { Router } from 'express'
import { ObjectId } from 'mongodb'
import * as contract from '@briefharbor/contracts'
import type { Case, Database } from '../db/index.js'
import { activeUser } from '../middleware/session.js'
import { missing, send, validate } from '../middleware/http.js'
import { audit, caseScope, eligibleOwner, membership, ownerRoles, people, requireRole, transaction } from './case-scope.js'
import { factDto, inquiryDto, summary } from './dto.js'
import { recordRoutes } from './records.js'

export function caseRoutes(db: Database) {
  const route = Router()
  route.get('/clients', async (req, res) => {
    const user = await activeUser(db, req)
    const memberships = await db.members.find({ userId: user._id, active: true }).toArray()
    const clients = await db.clients.find({ _id: { $in: memberships.map(item => item.clientId) } }).sort({ name: 1 }).toArray()
    const results = await Promise.all(clients.map(async client => ({
      id: client._id.toHexString(), name: client.name, synthetic: client.synthetic,
      members: memberships.some(item => item.clientId.equals(client._id) && item.roles.includes('COORDINATOR')) ? await people(db, client._id) : [],
      roles: memberships.find(item => item.clientId.equals(client._id))?.roles ?? [],
    })))
    send(res, contract.clients, results)
  })
  route.get('/cases', async (req, res) => {
    const user = await activeUser(db, req)
    const { clientId, ...filters } = validate(contract.caseFilters, req.query)
    const client = new ObjectId(clientId)
    const member = await membership(db, client, user._id)
    const assignments = await db.assignments.find({ clientId: client, userId: user._id, role: { $in: member.roles } }).toArray()
    const where = Object.fromEntries(Object.entries(filters).filter(([, value]) => value !== undefined))
    const items = await db.cases.find({ ...where, clientId: client, _id: { $in: assignments.map(item => item.caseId) } })
      .sort({ createdAt: -1 }).toArray()
    const nearest = await db.inquiries.aggregate<{ _id: ObjectId; date: Date }>([
      { $match: { clientId: client, caseId: { $in: items.map(item => item._id) }, status: 'OPEN' } },
      { $group: { _id: '$caseId', date: { $min: '$deadlineAt' } } },
    ]).toArray()
    const deadlines = new Map(nearest.map(row => [row._id.toHexString(), row.date]))
    send(res, contract.cases, items.map(item => summary(item, deadlines.get(item._id.toHexString()) ?? null)))
  })
  route.post('/cases', async (req, res) => {
    const user = await activeUser(db, req)
    const data = validate(contract.caseInput, req.body)
    const clientId = new ObjectId(data.clientId)
    const ownerId = new ObjectId(data.ownerId)
    const item = await transaction(db, async session => {
      const client = await db.clients.findOne({ _id: clientId }, { session })
      if (!client) throw missing()
      const member = await membership(db, clientId, user._id, session)
      requireRole(member.roles, 'COORDINATOR')
      const roles = await eligibleOwner(db, clientId, ownerId, ownerRoles, session)
      const item: Case = {
        _id: new ObjectId(), clientId, ownerId, title: data.title, type: data.type, severity: data.severity,
        status: 'NEW', nextUpdateAt: new Date(data.nextUpdateAt), createdAt: new Date(), synthetic: client.synthetic, workflowVersion: 0,
      }
      const scope = { clientId, caseId: item._id }
      await db.cases.insertOne(item, { session })
      await db.assignments.insertMany([
        { ...scope, userId: user._id, role: 'COORDINATOR' },
        ...roles.filter(role => !ownerId.equals(user._id) || role !== 'COORDINATOR').map(role => ({ ...scope, userId: ownerId, role })),
      ], { session })
      await audit(db, item, user._id, item._id, 'CASE_CREATED', session)
      return item
    })
    send(res, contract.caseSummary, summary(item, null), 201)
  })
  route.get('/cases/:caseId', async (req, res) => {
    const user = await activeUser(db, req)
    const caseId = new ObjectId(validate(contract.id, req.params.caseId, 'caseId'))
    const { item, scope, roles } = await caseScope(db, caseId, user._id)
    const [facts, inquiries, members, factOwnerOptions] = await Promise.all([
      db.facts.find({ ...scope, ...(roles.length === 1 && roles[0] === 'VIEWER' ? { visibility: 'SHAREABLE', status: 'VERIFIED' } : {}) }).sort({ createdAt: 1 }).toArray(),
      db.inquiries.find(scope).sort({ deadlineAt: 1 }).toArray(),
      people(db, scope.clientId, scope.caseId),
      roles.includes('COORDINATOR') ? people(db, scope.clientId).then(result => result.filter(person => person.roles.includes('FACT_OWNER'))) : [],
    ])
    const nearest = inquiries.find(inquiry => inquiry.status === 'OPEN')?.deadlineAt ?? null
    send(res, contract.caseDetail, { ...summary(item, nearest), roles, members, factOwnerOptions, facts: facts.map(factDto), inquiries: inquiries.map(inquiryDto) })
  })
  route.use('/cases/:caseId', recordRoutes(db))
  return route
}
