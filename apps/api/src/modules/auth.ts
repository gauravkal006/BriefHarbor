import { Router } from 'express'
import { rateLimit } from 'express-rate-limit'
import { hash, verify } from 'argon2'
import { account, csrf, login, signedOut } from '@briefharbor/contracts'
import type { Database, User } from '../db/index.js'
import type { Config } from '../config.js'
import { activeUser, cookieName, sessionAction, token } from '../middleware/session.js'
import { HttpError, send, validate } from '../middleware/http.js'

const dummy = hash('unregistered-' + token())
const accountDto = (user: User) => ({ id: user._id.toHexString(), name: user.name, email: user.email })

export function authRoutes(db: Database, config: Config) {
  const router = Router()
  const rate = rateLimit({
    windowMs: 15 * 60 * 1000, limit: 40, standardHeaders: 'draft-8', legacyHeaders: false,
    handler: () => { throw new HttpError(429, 'RATE_LIMIT', 'Too many sign-in attempts. Try again later.') },
  })
  router.get('/csrf', async (req, res) => {
    if (!req.session.csrf) {
      req.session.csrf = token()
      await sessionAction(req, 'save')
    }
    send(res, csrf, { token: req.session.csrf })
  })
  router.post('/login', rate, async (req, res) => {
    const data = validate(login, req.body)
    const user = await db.users.findOne({ email: data.email.toLowerCase(), active: true })
    const valid = await verify(user?.passwordHash ?? await dummy, data.password)
    if (!user || !valid) throw new HttpError(401, 'INVALID_LOGIN', 'Email or password is incorrect.')
    await sessionAction(req, 'regenerate')
    req.session.userId = user._id.toHexString()
    req.session.csrf = token()
    await sessionAction(req, 'save')
    send(res, account, accountDto(user))
  })
  router.get('/session', async (req, res) => send(res, account, accountDto(await activeUser(db, req))))
  router.post('/logout', async (req, res) => {
    await sessionAction(req, 'destroy')
    res.clearCookie(cookieName, { path: '/', httpOnly: true, sameSite: 'lax', secure: config.secure })
    send(res, signedOut, { signedOut: true })
  })
  return router
}
