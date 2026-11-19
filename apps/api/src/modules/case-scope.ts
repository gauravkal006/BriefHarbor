import { ObjectId, type ClientSession } from 'mongodb'
import type { Role } from '@briefharbor/contracts'
import type { Case, Database } from '../db/index.js'
import { conflict, forbidden, HttpError, missing } from '../middleware/http.js'

export const ownerRoles: Role[] = ['COORDINATOR', 'PR_LEAD']

export async function membership(db: Database, clientId: ObjectId, userId: ObjectId, session?: ClientSession) {
  const member = await db.members.findOne({ clientId, userId, active: true }, { session })
  if (!member) throw missing()
  return member
}

export async function caseScope(db: Database, caseId: ObjectId, userId: ObjectId, session?: ClientSession) {
  const item = await db.cases.findOne({ _id: caseId }, { session })
  if (!item) throw missing()
  const member = await membership(db, item.clientId, userId, session)
  const scope = { clientId: item.clientId, caseId: item._id }
  const assignments = await db.assignments.find({ ...scope, userId }, { session }).toArray()
  const roles = assignments.map(assignment => assignment.role).filter(role => member.roles.includes(role))
  if (!roles.length) throw missing()
  return { item, scope, roles }
}

export function requireRole(roles: Role[], role: Role) {
  if (!roles.includes(role)) throw forbidden()
}
export function requireOpen(item: Case) {
  if (item.status === 'CLOSED') throw new HttpError(409, 'CASE_CLOSED', 'This case is closed.')
}
export async function people(db: Database, clientId: ObjectId, caseId?: ObjectId) {
  const members = await db.members.find({ clientId, active: true }).toArray()
  const users = await db.users.find({ _id: { $in: members.map(member => member.userId) }, active: true }).sort({ name: 1 }).toArray()
  const assignments = caseId ? await db.assignments.find({ clientId, caseId }).toArray() : null
  const people = users.map(user => ({
    id: user._id.toHexString(), name: user.name,
    roles: (members.find(member => member.userId.equals(user._id))?.roles ?? []).filter(role =>
      !assignments || assignments.some(item => item.userId.equals(user._id) && item.role === role)),
  }))
  return people.filter(person => person.roles.length)
}
export async function eligibleOwner(db: Database, clientId: ObjectId, ownerId: ObjectId, allowed: Role[],
  session: ClientSession, caseId?: ObjectId) {
  const owner = await db.users.findOne({ _id: ownerId, active: true }, { session })
  const member = await db.members.findOne({ clientId, userId: ownerId, active: true }, { session })
  const roles = member?.roles.filter(role => allowed.includes(role)) ?? []
  const assignment = caseId && await db.assignments.findOne({ caseId, clientId, userId: ownerId, role: { $in: roles } }, { session })
  if (!owner || !roles.length || (caseId && !assignment)) {
    throw new HttpError(422, 'VALIDATION', 'Choose an eligible owner.', { ownerId: 'Choose an eligible owner for this record.' })
  }
  return roles
}

export function audit(db: Database, item: Case, actorId: ObjectId, targetId: ObjectId, action: string, session: ClientSession, reason?: string) {
  return db.audit.insertOne({ clientId: item.clientId, caseId: item._id, actorId, targetId, action, at: new Date(), ...(reason ? { reason } : {}) }, { session })
}

export function transaction<T>(db: Database, run: (session: ClientSession) => Promise<T>) {
  return db.client.withSession(session => session.withTransaction(() => run(session), {
    readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' }, timeoutMS: 15000, maxCommitTimeMS: 5000,
  }))
}

export async function workflowLock(db: Database, caseId: ObjectId, session: ClientSession) {
  const item = await db.cases.findOneAndUpdate({ _id: caseId }, { $inc: { workflowVersion: 1 } }, { session, returnDocument: 'after' })
  if (!item) throw missing()
  return item
}

export async function requireEvidence(db: Database, scope: { clientId: ObjectId; caseId: ObjectId }, ids: string[], session: ClientSession) {
  const unique = [...new Set(ids)]
  const facts = await db.facts.find({ ...scope, _id: { $in: unique.map(id => new ObjectId(id)) }, status: 'VERIFIED', visibility: 'SHAREABLE' }, { session }).toArray()
  if (!unique.length || facts.length !== unique.length) throw conflict('Every cited fact must still be verified and shareable.')
  return facts
}

export async function flagDeliveries(db: Database, scope: { clientId: ObjectId; caseId: ObjectId }, factId: string, session: ClientSession) {
  const revisions = await db.revisions.find({ ...scope, factVersionIds: factId }, { session }).toArray()
  await db.deliveries.updateMany({ ...scope, revisionId: { $in: revisions.map(item => item._id.toHexString()) } }, { $set: { followUp: true } }, { session })
}
