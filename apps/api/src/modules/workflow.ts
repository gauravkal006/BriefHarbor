import { Router } from 'express'
import { ObjectId, type ClientSession } from 'mongodb'
import { createHash } from 'node:crypto'
import * as contract from '@briefharbor/contracts'
import type { Case, Database } from '../db/index.js'
import type { Revision, Statement } from '../db/workflow.js'
import { activeUser } from '../middleware/session.js'
import { conflict, forbidden, missing, send, validate } from '../middleware/http.js'
import { audit, caseScope, eligibleOwner, flagDeliveries, people, requireEvidence, requireOpen, requireRole, transaction, workflowLock } from './case-scope.js'

const objectId = (input: unknown) => new ObjectId(validate(contract.id, input))
const statementDto = (item: Statement) => ({ ...item, id: item._id.toHexString(), caseId: item.caseId.toHexString() })

export async function revisionDto(db: Database, item: Revision, session?: ClientSession) {
  const decisions = await db.decisions.find({ clientId: item.clientId, caseId: item.caseId, revisionId: item._id.toHexString() }, { session }).toArray()
  return { ...item, id: item._id.toHexString(), caseId: item.caseId.toHexString(), submittedAt: item.submittedAt.toISOString(),
    decisions: decisions.map(row => ({ ...row, at: row.at.toISOString() })) }
}

export function requiredReviewers(item: Pick<Case, 'type' | 'sensitiveClaims' | 'personnelStatement'>): contract.ReviewerRole[] {
  return contract.reviewerPolicy(item.type, item.sensitiveClaims, item.personnelStatement)
}

async function currentRevision(db: Database, revision: Revision, session: ClientSession) {
  const statement = await db.statements.findOne({ _id: new ObjectId(revision.statementId), clientId: revision.clientId, caseId: revision.caseId }, { session })
  if (!statement || statement.currentRevisionId !== revision._id.toHexString()) throw conflict('This revision is no longer current.')
  return statement
}

async function approved(db: Database, revision: Revision, item: Case, session: ClientSession) {
  await currentRevision(db, revision, session)
  if (revision.state !== 'APPROVED') throw conflict('Complete all required approvals before export.')
  const roles = requiredReviewers(item)
  const decisions = await db.decisions.find({ clientId: item.clientId, caseId: item._id, revisionId: revision._id.toHexString() }, { session }).toArray()
  for (const role of roles) {
    const reviewer = revision.reviewers.find(person => person.role === role)
    if (!reviewer || reviewer.userId === revision.authorId ||
        !decisions.some(decision => decision.userId === reviewer.userId && decision.decision === 'APPROVE')) {
      throw conflict('Required approval is missing.')
    }
    await eligibleOwner(db, item.clientId, new ObjectId(reviewer.userId), [role], session, item._id)
  }
  await requireEvidence(db, { clientId: item.clientId, caseId: item._id }, revision.factVersionIds, session)
}

export function workflowRoutes(db: Database) {
  const route = Router()
  route.get('/cases/:caseId/workflow', async (req, res) => {
    const user = await activeUser(db, req)
    const { item, scope, roles } = await caseScope(db, objectId(req.params.caseId), user._id)
    if (roles.every(role => role === 'VIEWER')) throw forbidden()
    const [statements, revisions, tasks, deliveries, timeline, members] = await Promise.all([
      db.statements.find(scope).toArray(), db.revisions.find(scope).sort({ submittedAt: -1 }).toArray(),
      db.tasks.find(scope).sort({ deadlineAt: 1 }).toArray(), db.deliveries.find(scope).sort({ sentAt: -1 }).toArray(),
      db.audit.find(scope).sort({ at: -1, _id: -1 }).toArray(), people(db, item.clientId, item._id),
    ])
    send(res, contract.workflowDto, {
      statements: statements.map(statementDto), revisions: await Promise.all(revisions.map(row => revisionDto(db, row))),
      tasks: tasks.map(row => ({ ...row, id: row._id.toHexString(), deadlineAt: row.deadlineAt.toISOString() })),
      deliveries: deliveries.map(row => ({ ...row, id: row._id.toHexString(), sentAt: row.sentAt.toISOString() })),
      timeline: timeline.map(row => ({ ...row, id: row._id.toHexString(), actorId: row.actorId.toHexString(), targetId: row.targetId.toHexString(), at: row.at.toISOString() })),
      members, status: item.status, sensitiveClaims: item.sensitiveClaims ?? false, personnelStatement: item.personnelStatement ?? false,
    })
  })
  route.get('/cases/:caseId/report', async (req, res) => {
    const user = await activeUser(db, req)
    const { item, scope, roles } = await caseScope(db, objectId(req.params.caseId), user._id)
    if (roles.every(role => role === 'VIEWER')) throw forbidden()
    const [events, deliveries, tasks, decisions, revisions] = await Promise.all([
      db.audit.find(scope).sort({ at: 1, _id: 1 }).toArray(), db.deliveries.find(scope).toArray(),
      db.tasks.find(scope).toArray(), db.decisions.find(scope).toArray(), db.revisions.find(scope).toArray(),
    ])
    const report = [
      item.title, 'Status: ' + item.status, '',
      'TIMELINE', ...events.map(event => [event.at.toISOString(), event.actorId.toHexString(), event.action, event.targetId.toHexString(), event.reason ?? ''].join(' | ')),
      '', 'REVISIONS', ...revisions.map(row => [row._id.toHexString(), 'v' + row.version, row.state, row.authorId, row.text].join(' | ')),
      '', 'DECISIONS', ...decisions.map(row => [row.at.toISOString(), row.revisionId, row.userId, row.decision, row.comment].join(' | ')),
      '', 'DELIVERIES', ...deliveries.map(row => [row.sentAt.toISOString(), row.revisionId, row.actorId, row.inquiryId ?? row.audience, row.followUp ? 'FOLLOW-UP REQUIRED' : 'Recorded'].join(' | ')),
      '', 'TASKS', ...tasks.map(row => [row.title, row.assigneeId, row.status, row.deadlineAt.toISOString(), row.reason ?? ''].join(' | ')),
    ].join('\n')
    res.type('text/plain').attachment('briefharbor-report.txt').send(report)
  })
  route.post('/cases/:caseId/statements', async (req, res) => {
    const user = await activeUser(db, req)
    const caseId = objectId(req.params.caseId)
    const input = validate(contract.statementInput, req.body)
    const statement = await transaction(db, async session => {
      await workflowLock(db, caseId, session)
      const { item, scope, roles } = await caseScope(db, caseId, user._id, session)
      requireRole(roles, 'COORDINATOR'); requireOpen(item)
      if (input.inquiryId && !await db.inquiries.findOne({ ...scope, _id: new ObjectId(input.inquiryId) }, { session })) throw missing()
      const statement: Statement = { ...scope, _id: new ObjectId(), audience: input.audience, inquiryId: input.inquiryId ?? null,
        draft: '', draftVersion: 0, authorId: user._id.toHexString(), currentRevisionId: null, revisionCount: 0 }
      await db.statements.insertOne(statement, { session })
      await audit(db, item, user._id, statement._id, 'STATEMENT_CREATED', session)
      return statement
    })
    send(res, contract.statementDto, statementDto(statement), 201)
  })
  route.get('/statements/:id', async (req, res) => {
    const user = await activeUser(db, req)
    const statement = await db.statements.findOne({ _id: objectId(req.params.id) })
    if (!statement) throw missing()
    const { roles } = await caseScope(db, statement.caseId, user._id)
    if (roles.every(role => role === 'VIEWER')) throw forbidden()
    const revisions = await db.revisions.find({ clientId: statement.clientId, caseId: statement.caseId, statementId: statement._id.toHexString() }).sort({ version: -1 }).toArray()
    send(res, contract.statementDetailDto, { statement: statementDto(statement), revisions: await Promise.all(revisions.map(row => revisionDto(db, row))) })
  })
  route.patch('/statements/:id/draft', async (req, res) => {
    const user = await activeUser(db, req)
    const statementId = objectId(req.params.id)
    const input = validate(contract.draftInput, req.body)
    const existing = await db.statements.findOne({ _id: statementId })
    if (!existing) throw missing()
    const statement = await transaction(db, async session => {
      await workflowLock(db, existing.caseId, session)
      const { item, scope, roles } = await caseScope(db, existing.caseId, user._id, session)
      requireRole(roles, 'COORDINATOR'); requireOpen(item)
      if (existing.authorId !== user._id.toHexString()) throw forbidden()
      const updated = await db.statements.findOneAndUpdate({ ...scope, _id: statementId, draftVersion: input.expectedVersion },
        { $set: { draft: input.text }, $inc: { draftVersion: 1 } }, { session, returnDocument: 'after' })
      if (!updated) throw conflict('The draft changed. Reload before saving.')
      await audit(db, item, user._id, statementId, 'DRAFT_SAVED', session)
      return updated
    })
    send(res, contract.statementDto, statementDto(statement))
  })
  route.post('/statements/:id/revisions', async (req, res) => {
    const user = await activeUser(db, req)
    const statementId = objectId(req.params.id)
    const input = validate(contract.revisionInput, req.body)
    const existing = await db.statements.findOne({ _id: statementId })
    if (!existing) throw missing()
    const revision = await transaction(db, async session => {
      await workflowLock(db, existing.caseId, session)
      const { item, scope, roles } = await caseScope(db, existing.caseId, user._id, session)
      requireRole(roles, 'COORDINATOR'); requireOpen(item)
      const statement = await db.statements.findOne({ ...scope, _id: statementId }, { session })
      if (!statement) throw missing()
      if (statement.authorId !== user._id.toHexString()) throw forbidden()
      if (statement.draftVersion !== input.expectedVersion || !statement.draft.trim()) throw conflict('Save the current draft before submitting.')
      const required = requiredReviewers(item)
      if (new Set(input.reviewers.map(row => row.userId)).size !== input.reviewers.length ||
          input.reviewers.some(row => row.userId === statement.authorId) ||
          input.reviewers.length !== required.length || required.some(role => !input.reviewers.some(row => row.role === role))) {
        throw conflict('Choose a distinct named reviewer for every required role. Authors cannot review their own text.')
      }
      for (const reviewer of input.reviewers) {
        await eligibleOwner(db, item.clientId, new ObjectId(reviewer.userId), [reviewer.role], session, item._id)
      }
      await requireEvidence(db, scope, input.factVersionIds, session)
      const revision: Revision = { ...scope, _id: new ObjectId(), statementId: statementId.toHexString(), text: statement.draft,
        version: (statement.revisionCount ?? 0) + 1, authorId: statement.authorId, submittedAt: new Date(),
        factVersionIds: [...new Set(input.factVersionIds)], state: 'IN_REVIEW', reviewers: input.reviewers }
      await db.revisions.insertOne(revision, { session })
      await db.statements.updateOne({ ...scope, _id: statementId }, {
        $set: { currentRevisionId: revision._id.toHexString(), revisionCount: revision.version }, $inc: { draftVersion: 1 },
      }, { session })
      await audit(db, item, user._id, revision._id, 'REVISION_SUBMITTED', session)
      return revision
    })
    send(res, contract.revisionDto, await revisionDto(db, revision), 201)
  })
  route.post('/revisions/:id/decisions', async (req, res) => {
    const user = await activeUser(db, req)
    const revisionId = objectId(req.params.id)
    const input = validate(contract.decisionInput, req.body)
    const existing = await db.revisions.findOne({ _id: revisionId })
    if (!existing) throw missing()
    const revision = await transaction(db, async session => {
      await workflowLock(db, existing.caseId, session)
      const { item, scope, roles } = await caseScope(db, existing.caseId, user._id, session)
      requireOpen(item)
      const revision = await db.revisions.findOne({ ...scope, _id: revisionId }, { session })
      if (!revision) throw missing()
      await currentRevision(db, revision, session)
      if (revision.state !== 'IN_REVIEW') throw conflict('Review has ended.')
      const reviewer = revision.reviewers.find(row => row.userId === user._id.toHexString())
      if (!reviewer || !roles.includes(reviewer.role) || revision.authorId === user._id.toHexString()) throw forbidden()
      if (await db.decisions.findOne({ ...scope, revisionId: revisionId.toHexString(), userId: reviewer.userId }, { session })) throw conflict('Your decision is already recorded.')
      await db.decisions.insertOne({ ...scope, revisionId: revisionId.toHexString(), userId: reviewer.userId, ...input, at: new Date() }, { session })
      const decisions = await db.decisions.find({ ...scope, revisionId: revisionId.toHexString() }, { session }).toArray()
      const state = input.decision === 'REQUEST_CHANGES' ? 'CHANGES_REQUESTED' :
        revision.reviewers.every(row => decisions.some(decision => decision.userId === row.userId && decision.decision === 'APPROVE')) ? 'APPROVED' : 'IN_REVIEW'
      await db.revisions.updateOne({ ...scope, _id: revisionId }, { $set: { state } }, { session })
      await audit(db, item, user._id, revisionId, input.decision, session, input.comment)
      return { ...revision, state } as Revision
    })
    send(res, contract.revisionDto, await revisionDto(db, revision))
  })
  route.post('/revisions/:id/exports', async (req, res) => {
    const user = await activeUser(db, req)
    const revisionId = objectId(req.params.id)
    const existing = await db.revisions.findOne({ _id: revisionId })
    if (!existing) throw missing()
    const text = await transaction(db, async session => {
      await workflowLock(db, existing.caseId, session)
      const { item, scope, roles } = await caseScope(db, existing.caseId, user._id, session)
      requireRole(roles, 'COORDINATOR'); requireOpen(item)
      const revision = await db.revisions.findOne({ ...scope, _id: revisionId }, { session })
      if (!revision) throw missing()
      await approved(db, revision, item, session)
      await db.exports.insertOne({ ...scope, revisionId: revisionId.toHexString(), actorId: user._id.toHexString(), at: new Date() }, { session })
      await audit(db, item, user._id, revisionId, 'EXPORTED', session)
      return revision.text
    })
    res.type('text/plain').attachment('briefharbor-release.txt').send(text)
  })
  route.post('/cases/:caseId/deliveries', async (req, res) => {
    const user = await activeUser(db, req)
    const caseId = objectId(req.params.caseId)
    const input = validate(contract.deliveryInput, req.body)
    const key = validate(contract.idempotencyKey, req.get('Idempotency-Key'))
    const fingerprint = createHash('sha256').update(JSON.stringify({
      revisionId: input.revisionId, inquiryId: input.inquiryId ?? null, audience: input.audience ?? null, channel: input.channel, sentAt: input.sentAt,
    })).digest('hex')
    const delivery = await transaction(db, async session => {
      await workflowLock(db, caseId, session)
      const { item, scope, roles } = await caseScope(db, caseId, user._id, session)
      requireRole(roles, 'COORDINATOR')
      const previous = await db.deliveries.findOne({ ...scope, idempotencyKey: key }, { session })
      if (previous) {
        if (previous.fingerprint !== fingerprint) throw conflict('This idempotency key was used for different delivery details.')
        return previous
      }
      const revision = await db.revisions.findOne({ ...scope, _id: new ObjectId(input.revisionId) }, { session })
      if (!revision || !await db.exports.findOne({ ...scope, revisionId: input.revisionId }, { session })) throw conflict('Record delivery for a previously exported revision.')
      if (input.inquiryId) {
        const inquiry = await db.inquiries.findOne({ ...scope, _id: new ObjectId(input.inquiryId) }, { session })
        if (!inquiry) throw missing()
        if (inquiry.status !== 'OPEN') throw conflict('The inquiry is already resolved.')
        await db.inquiries.updateOne({ ...scope, _id: inquiry._id }, { $set: { status: 'RESPONDED' } }, { session })
      }
      const facts = await db.facts.find({ ...scope, _id: { $in: revision.factVersionIds.map(id => new ObjectId(id)) }, status: 'VERIFIED', visibility: 'SHAREABLE' }, { session }).toArray()
      const record = { ...scope, _id: new ObjectId(), ...input, inquiryId: input.inquiryId ?? null, audience: input.audience ?? null,
        sentAt: new Date(input.sentAt), actorId: user._id.toHexString(), followUp: facts.length !== revision.factVersionIds.length,
        idempotencyKey: key, fingerprint }
      await db.deliveries.insertOne(record, { session })
      await audit(db, item, user._id, record._id, 'DELIVERY_RECORDED', session)
      return record
    })
    send(res, contract.deliveryDto, { ...delivery, id: delivery._id.toHexString(), sentAt: delivery.sentAt.toISOString() }, 201)
  })
  route.post('/cases/:caseId/tasks', async (req, res) => {
    const user = await activeUser(db, req)
    const caseId = objectId(req.params.caseId)
    const input = validate(contract.taskInput, req.body)
    const task = await transaction(db, async session => {
      await workflowLock(db, caseId, session)
      const { item, scope, roles } = await caseScope(db, caseId, user._id, session)
      if (!roles.some(role => role === 'COORDINATOR' || role === 'PR_LEAD')) throw forbidden()
      requireOpen(item)
      await eligibleOwner(db, item.clientId, new ObjectId(input.assigneeId), contract.role.options, session, caseId)
      const task = { ...scope, _id: new ObjectId(), ...input, deadlineAt: new Date(input.deadlineAt), status: 'OPEN' as const, reason: null }
      await db.tasks.insertOne(task, { session })
      await audit(db, item, user._id, task._id, 'TASK_CREATED', session)
      return task
    })
    send(res, contract.taskDto, { ...task, id: task._id.toHexString(), deadlineAt: task.deadlineAt.toISOString() }, 201)
  })
  route.patch('/cases/:caseId/tasks/:taskId', async (req, res) => {
    const user = await activeUser(db, req)
    const caseId = objectId(req.params.caseId)
    const taskId = objectId(req.params.taskId)
    const input = validate(contract.taskEdit, req.body)
    const task = await transaction(db, async session => {
      await workflowLock(db, caseId, session)
      const { item, scope, roles } = await caseScope(db, caseId, user._id, session)
      requireOpen(item)
      const task = await db.tasks.findOne({ ...scope, _id: taskId }, { session })
      if (!task) throw missing()
      if (task.assigneeId !== user._id.toHexString() && !roles.includes('PR_LEAD')) throw forbidden()
      const updated = await db.tasks.findOneAndUpdate({ ...scope, _id: taskId }, { $set: { status: input.status, reason: input.reason ?? null } }, { session, returnDocument: 'after' })
      if (!updated) throw missing()
      await audit(db, item, user._id, taskId, 'TASK_UPDATED', session, input.reason)
      return updated
    })
    send(res, contract.taskDto, { ...task, id: task._id.toHexString(), deadlineAt: task.deadlineAt.toISOString() })
  })
  route.post('/cases/:caseId/assignments', async (req, res) => {
    const user = await activeUser(db, req)
    const caseId = objectId(req.params.caseId)
    const input = validate(contract.assignmentInput, req.body)
    await transaction(db, async session => {
      await workflowLock(db, caseId, session)
      const { item, scope, roles } = await caseScope(db, caseId, user._id, session)
      if (!roles.some(role => role === 'PR_LEAD' || role === 'COORDINATOR')) throw forbidden()
      requireOpen(item)
      await eligibleOwner(db, item.clientId, new ObjectId(input.userId), [input.role], session)
      const assignment = { ...scope, userId: new ObjectId(input.userId), role: input.role }
      await db.assignments.updateOne(assignment, { $setOnInsert: assignment }, { session, upsert: true })
      await audit(db, item, user._id, assignment.userId, 'MEMBER_ASSIGNED', session, input.role)
    })
    send(res, contract.acknowledgement, { ok: true })
  })
  route.patch('/cases/:caseId', async (req, res) => {
    const user = await activeUser(db, req)
    const caseId = objectId(req.params.caseId)
    const input = validate(contract.caseEdit, req.body)
    await transaction(db, async session => {
      await workflowLock(db, caseId, session)
      const { item, scope, roles } = await caseScope(db, caseId, user._id, session)
      requireRole(roles, 'PR_LEAD')
      if (input.status === 'CLOSED') {
        if (await db.inquiries.countDocuments({ ...scope, status: 'OPEN' }, { session })) throw conflict('Resolve open inquiries before closing.')
        const statements = await db.statements.find(scope, { session }).toArray()
        const currentIds = statements.flatMap(statement => statement.currentRevisionId ? [new ObjectId(statement.currentRevisionId)] : [])
        if (await db.revisions.countDocuments({ ...scope, _id: { $in: currentIds }, state: 'IN_REVIEW' }, { session })) throw conflict('Finish pending reviews before closing.')
        const remaining = await db.tasks.find({ ...scope, status: 'OPEN' }, { session }).toArray()
        for (const task of remaining) {
          await eligibleOwner(db, item.clientId, new ObjectId(task.assigneeId), contract.role.options, session, item._id)
        }
      }
      await db.cases.updateOne({ _id: caseId, clientId: item.clientId }, { $set: {
        status: input.status,
        ...(input.sensitiveClaims !== undefined ? { sensitiveClaims: input.sensitiveClaims } : {}),
        ...(input.personnelStatement !== undefined ? { personnelStatement: input.personnelStatement } : {}),
      } }, { session })
      await audit(db, item, user._id, caseId, item.status === 'CLOSED' ? 'CASE_REOPENED' : 'CASE_UPDATED', session, input.reason)
    })
    send(res, contract.acknowledgement, { ok: true })
  })
  route.post('/cases/:caseId/facts/:factId/evidence', async (req, res) => {
    const user = await activeUser(db, req)
    const caseId = objectId(req.params.caseId)
    const factId = objectId(req.params.factId)
    const input = validate(contract.evidenceEdit, req.body)
    await transaction(db, async session => {
      await workflowLock(db, caseId, session)
      const { item, scope, roles } = await caseScope(db, caseId, user._id, session)
      requireRole(roles, 'FACT_OWNER'); requireOpen(item)
      const fact = await db.facts.findOne({ ...scope, _id: factId }, { session })
      if (!fact) throw missing()
      if (!fact.ownerId.equals(user._id)) throw forbidden()
      if (fact.status === 'SUPERSEDED') throw conflict('This fact was already superseded.')
      if (input.action === 'SUPERSEDE') {
        await db.facts.updateOne({ ...scope, _id: factId }, { $set: { status: 'SUPERSEDED' } }, { session })
        await db.facts.insertOne({ ...fact, _id: new ObjectId(), version: fact.version + 1, claim: input.claim, source: input.source,
          status: 'UNVERIFIED', visibility: 'INTERNAL', verifierId: null, verifiedAt: null, createdAt: new Date() }, { session })
      } else {
        if (input.action === 'SHARE' && fact.status !== 'VERIFIED') throw conflict('Verify the fact before marking it shareable.')
        await db.facts.updateOne({ ...scope, _id: factId }, { $set: { visibility: input.action === 'SHARE' ? 'SHAREABLE' : 'INTERNAL' } }, { session })
      }
      if (input.action !== 'SHARE') await flagDeliveries(db, scope, factId.toHexString(), session)
      await audit(db, item, user._id, factId, input.action === 'SUPERSEDE' ? 'FACT_SUPERSEDED' : input.action === 'SHARE' ? 'FACT_SHARED' : 'FACT_RESTRICTED', session, input.reason)
    })
    send(res, contract.acknowledgement, { ok: true })
  })
  return route
}

