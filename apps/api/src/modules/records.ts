import { Router } from 'express'
import { ObjectId } from 'mongodb'
import * as contract from '@briefharbor/contracts'
import type { Database, FactVersion, MediaInquiry } from '../db/index.js'
import { activeUser } from '../middleware/session.js'
import { conflict, forbidden, missing, send, validate } from '../middleware/http.js'
import { audit, caseScope, eligibleOwner, ownerRoles, requireOpen, requireRole, transaction } from './case-scope.js'
import { factDto, inquiryDto } from './dto.js'

export function recordRoutes(db: Database) {
  const router = Router({ mergeParams: true })
  router.post<'/facts', { caseId: string }>('/facts', async (req, res) => {
    const user = await activeUser(db, req)
    const caseId = new ObjectId(validate(contract.id, req.params.caseId, 'caseId'))
    const input = validate(contract.factInput, req.body)
    const fact = await transaction(db, async session => {
      const { item, scope, roles } = await caseScope(db, caseId, user._id, session)
      requireRole(roles, 'COORDINATOR')
      requireOpen(item)
      const ownerId = new ObjectId(input.ownerId)
      await eligibleOwner(db, item.clientId, ownerId, ['FACT_OWNER'], session)
      const assignment = { ...scope, userId: ownerId, role: 'FACT_OWNER' as const }
      await db.assignments.updateOne(assignment, { $setOnInsert: assignment }, { session, upsert: true })
      const id = new ObjectId()
      const fact: FactVersion = {
        ...scope, _id: id, logicalFactId: id, version: 1, createdAt: new Date(),
        claim: input.claim, source: input.source, ownerId, visibility: input.visibility,
        status: 'UNVERIFIED', verifierId: null, verifiedAt: null,
      }
      await db.facts.insertOne(fact, { session })
      await audit(db, item, user._id, id, 'FACT_ADDED', session)
      return fact
    })
    send(res, contract.fact, factDto(fact), 201)
  })
  router.patch<'/facts/:factId', { caseId: string; factId: string }>('/facts/:factId', async (req, res) => {
    const user = await activeUser(db, req)
    const caseId = new ObjectId(validate(contract.id, req.params.caseId, 'caseId'))
    const factId = new ObjectId(validate(contract.id, req.params.factId, 'factId'))
    const input = validate(contract.factEdit, req.body)
    const fact = await transaction(db, async session => {
      const { item, scope, roles } = await caseScope(db, caseId, user._id, session)
      const key = { ...scope, _id: factId }
      const current = await db.facts.findOne(key, { session })
      if (!current) throw missing()
      requireRole(roles, 'FACT_OWNER')
      requireOpen(item)
      if (!current.ownerId.equals(user._id)) throw forbidden()
      if (current.status !== 'UNVERIFIED') throw conflict('Only an unverified fact can be verified.')
      const bumped = await db.cases.updateOne({ _id: item._id, clientId: item.clientId, workflowVersion: item.workflowVersion },
        { $inc: { workflowVersion: 1 } }, { session })
      if (!bumped.modifiedCount) throw conflict('The case changed. Reload and try again.')
      const updated = await db.facts.findOneAndUpdate({ ...key, status: 'UNVERIFIED' }, { $set: {
        status: input.status, visibility: input.visibility ?? current.visibility, verifierId: user._id, verifiedAt: new Date(),
      } }, { session, returnDocument: 'after' })
      if (!updated) throw conflict('The fact changed. Reload and try again.')
      await audit(db, item, user._id, factId, 'FACT_VERIFIED', session)
      return updated
    })
    send(res, contract.fact, factDto(fact))
  })
  router.post<'/inquiries', { caseId: string }>('/inquiries', async (req, res) => {
    const user = await activeUser(db, req)
    const caseId = new ObjectId(validate(contract.id, req.params.caseId, 'caseId'))
    const input = validate(contract.inquiryInput, req.body)
    const inquiry = await transaction(db, async session => {
      const { item, scope, roles } = await caseScope(db, caseId, user._id, session)
      requireRole(roles, 'COORDINATOR')
      requireOpen(item)
      const ownerId = new ObjectId(input.ownerId)
      await eligibleOwner(db, item.clientId, ownerId, ownerRoles, session, caseId)
      const inquiry: MediaInquiry = {
        ...scope, _id: new ObjectId(), outlet: input.outlet, contact: input.contact, question: input.question,
        ownerId, deadlineAt: new Date(input.deadlineAt), status: 'OPEN', closureReason: null, createdAt: new Date(),
      }
      await db.inquiries.insertOne(inquiry, { session })
      await audit(db, item, user._id, inquiry._id, 'INQUIRY_ADDED', session)
      return inquiry
    })
    send(res, contract.inquiry, inquiryDto(inquiry), 201)
  })
  router.patch<'/inquiries/:inquiryId', { caseId: string; inquiryId: string }>('/inquiries/:inquiryId', async (req, res) => {
    const user = await activeUser(db, req)
    const caseId = new ObjectId(validate(contract.id, req.params.caseId, 'caseId'))
    const inquiryId = new ObjectId(validate(contract.id, req.params.inquiryId, 'inquiryId'))
    const input = validate(contract.inquiryEdit, req.body)
    const inquiry = await transaction(db, async session => {
      const { item, scope, roles } = await caseScope(db, caseId, user._id, session)
      const key = { ...scope, _id: inquiryId }
      const current = await db.inquiries.findOne(key, { session })
      if (!current) throw missing()
      requireRole(roles, 'COORDINATOR')
      requireOpen(item)
      if (current.status !== 'OPEN') throw conflict('Only an open inquiry can be edited.')
      const ownerId = input.ownerId ? new ObjectId(input.ownerId) : undefined
      if (ownerId) await eligibleOwner(db, item.clientId, ownerId, ownerRoles, session, caseId)
      const updated = await db.inquiries.findOneAndUpdate({ ...key, status: 'OPEN' }, { $set: {
        ...(ownerId && { ownerId }),
        ...(input.deadlineAt && { deadlineAt: new Date(input.deadlineAt) }),
        ...(input.status && { status: input.status, closureReason: input.closureReason }),
      } }, { session, returnDocument: 'after' })
      if (!updated) throw conflict('The inquiry changed. Reload and try again.')
      await audit(db, item, user._id, inquiryId, input.status ? 'INQUIRY_CLOSED' : 'INQUIRY_UPDATED', session)
      return updated
    })
    send(res, contract.inquiry, inquiryDto(inquiry))
  })
  return router
}
