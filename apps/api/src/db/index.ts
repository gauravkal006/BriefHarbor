import { MongoClient, type Db, type ObjectId } from 'mongodb'
import type { SessionData } from 'express-session'
import type { CaseSummary, Fact, Inquiry, Role } from '@briefharbor/contracts'
import type { Config } from '../config.js'

type Entity = { _id: ObjectId }
type ClientScope = { clientId: ObjectId }
type CaseScope = ClientScope & { caseId: ObjectId }
export type User = Entity & { name: string; email: string; passwordHash: string; active: boolean }
export type Client = Entity & { name: string; synthetic: boolean }
export type Member = ClientScope & { userId: ObjectId; roles: Role[]; active: boolean }
export type Assignment = CaseScope & { userId: ObjectId; role: Role }
export type Case = Entity & ClientScope & Pick<CaseSummary, 'title' | 'type' | 'severity' | 'status' | 'synthetic'> & {
  ownerId: ObjectId; nextUpdateAt: Date; createdAt: Date; workflowVersion: number;
}
export type FactVersion = Entity & CaseScope & Pick<Fact, 'claim' | 'source' | 'version' | 'visibility' | 'status'> & {
  logicalFactId: ObjectId; ownerId: ObjectId; verifierId: ObjectId | null; verifiedAt: Date | null; createdAt: Date;
}
export type MediaInquiry = Entity & CaseScope & Pick<Inquiry, 'outlet' | 'contact' | 'question' | 'status' | 'closureReason'> & {
  ownerId: ObjectId; deadlineAt: Date; createdAt: Date;
}
export type SessionRow = { _id: string; data: SessionData; expiresAt: Date }
export type Audit = ClientScope & { caseId: ObjectId; actorId: ObjectId; targetId: ObjectId; action: string; at: Date }

function collections(db: Db) {
  return {
    users: db.collection<User>('users'), clients: db.collection<Client>('clients'),
    members: db.collection<Member>('memberships'), assignments: db.collection<Assignment>('caseAssignments'),
    cases: db.collection<Case>('cases'), facts: db.collection<FactVersion>('factVersions'),
    inquiries: db.collection<MediaInquiry>('inquiries'), audit: db.collection<Audit>('auditEvents'),
    sessions: db.collection<SessionRow>('sessions'),
  }
}

async function indexes(c: ReturnType<typeof collections>) {
  await Promise.all([
    c.users.createIndex({ email: 1 }, { unique: true }),
    c.members.createIndex({ clientId: 1, userId: 1 }, { unique: true }),
    c.members.createIndex({ userId: 1, active: 1 }),
    c.assignments.createIndex({ caseId: 1, userId: 1, role: 1 }, { unique: true }),
    c.assignments.createIndex({ clientId: 1, userId: 1, caseId: 1 }),
    c.cases.createIndex({ clientId: 1, createdAt: -1 }),
    c.cases.createIndex({ clientId: 1, status: 1, severity: 1, type: 1 }),
    c.facts.createIndex({ clientId: 1, caseId: 1, logicalFactId: 1, version: 1 }, { unique: true }),
    c.inquiries.createIndex({ clientId: 1, caseId: 1, status: 1, deadlineAt: 1 }),
    c.audit.createIndex({ clientId: 1, caseId: 1, at: 1 }),
    c.sessions.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
  ])
}

export async function connect(config: Config) {
  const client = new MongoClient(config.uri, { serverSelectionTimeoutMS: 6000, waitQueueTimeoutMS: 6000, socketTimeoutMS: 15000 })
  try {
    await client.connect()
    const db = client.db(config.dbName)
    const topology = await db.command({ hello: 1 })
    if (!topology.setName && topology.msg !== 'isdbgrid') throw new Error('MongoDB must run as a replica set or sharded cluster.')
    const tables = collections(db)
    await indexes(tables)
    return { client, db, ...tables }
  } catch (error) {
    await client.close()
    throw error
  }
}
export type Database = Awaited<ReturnType<typeof connect>>
