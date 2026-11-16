import express from 'express'
import type { Config } from './config.js'
import type { Database } from './db/index.js'
import { errors, missing } from './middleware/http.js'
import { protect, sessions } from './middleware/session.js'
import { authRoutes } from './modules/auth.js'
import { caseRoutes } from './modules/cases.js'

export function createApp(db: Database, config: Config) {
  const app = express()
  app.disable('x-powered-by')
  app.set('trust proxy', config.proxyHops)
  app.use((_req, res, next) => {
    res.set({ 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' })
    next()
  })
  app.get('/api/health/live', (_req, res) => { res.json({ data: { status: 'ok' } }) })
  app.get('/api/health/ready', async (_req, res) => {
    try { await db.db.command({ ping: 1, maxTimeMS: 2300 }); res.json({ data: { status: 'ready' } }) }
    catch { res.status(503).json({ error: { code: 'UNAVAILABLE', message: 'Service unavailable.', fieldErrors: {} } }) }
  })
  app.use('/api', express.json({ limit: '24kb' }), sessions(db, config), protect(config.origin))
  app.use('/api/auth', authRoutes(db, config))
  app.use('/api', caseRoutes(db))
  app.use((_req, _res) => { throw missing() })
  app.use(errors)
  return app
}
