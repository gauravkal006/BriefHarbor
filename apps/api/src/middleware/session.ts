import { randomBytes, timingSafeEqual } from 'node:crypto'
import type { Request, RequestHandler } from 'express'
import session, { type SessionData } from 'express-session'
import { ObjectId } from 'mongodb'
import type { Database } from '../db/index.js'
import type { Config } from '../config.js'
import { HttpError, actorId, unauthorized } from './http.js'

declare module 'express-session' {
  interface SessionData { userId?: string; csrf?: string }
}
const maxAge = 8 * 60 * 60 * 1000
export const cookieName = 'briefharbor.sid'
class MongoSessions extends session.Store {
  constructor(private readonly db: Database) { super() }
  get(id: string, done: (error: unknown, data?: SessionData | null) => void) {
    this.db.sessions.findOne({ _id: id, expiresAt: { $gt: new Date() } })
      .then(row => done(null, row?.data ?? null), done)
  }
  set(id: string, data: SessionData, done = (_error?: unknown) => { void _error }) {
    const expiresAt = data.cookie.expires ? new Date(data.cookie.expires) : new Date(Date.now() + maxAge)
    this.db.sessions.updateOne({ _id: id }, { $set: { data: JSON.parse(JSON.stringify(data)) as SessionData, expiresAt } }, { upsert: true }).then(() => done(), done)
  }
  destroy(id: string, done = (_error?: unknown) => { void _error }) {
    this.db.sessions.deleteOne({ _id: id }).then(() => done(), done)
  }
}
export function sessions(db: Database, config: Config) {
  return session({
    name: cookieName, secret: config.secret, store: new MongoSessions(db), resave: false, saveUninitialized: false,
    cookie: { httpOnly: true, sameSite: 'lax', secure: config.secure, maxAge, path: '/' },
  })
}
export function token() { return randomBytes(32).toString('hex') }

export function protect(origin: string): RequestHandler {
  return (req, _res, next) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next()
    if (req.get('Origin') !== origin) throw new HttpError(403, 'ORIGIN', 'The request origin is not allowed.')
    const supplied = req.get('X-CSRF-Token')
    const expected = req.session.csrf
    if (!supplied || !expected || !/^[0-9a-f]{64}$/.test(supplied) ||
      !timingSafeEqual(Buffer.from(supplied, 'hex'), Buffer.from(expected, 'hex'))) {
      throw new HttpError(403, 'CSRF', 'The security token expired. Try the action again.')
    }
    next()
  }
}
export async function activeUser(db: Database, req: Request) {
  const user = await db.users.findOne({ _id: new ObjectId(actorId(req)), active: true })
  if (!user) throw unauthorized()
  return user
}
export function sessionAction(req: Request, action: 'regenerate' | 'save' | 'destroy') {
  return new Promise<void>((resolve, reject) => req.session[action](error => error ? reject(error) : resolve()))
}
