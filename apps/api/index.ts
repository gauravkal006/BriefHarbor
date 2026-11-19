import express from 'express'
import { config } from './src/config.js'
import { connect } from './src/db/index.js'
import { createApp } from './src/app.js'

const app = express()
let initialized: Promise<ReturnType<typeof createApp>> | undefined

function application() {
  if (!initialized) {
    initialized = (async () => {
      const options = config()
      return createApp(await connect(options), options)
    })().catch(error => {
      initialized = undefined
      throw error
    })
  }
  return initialized
}

app.use(async (req, res) => {
  try { (await application())(req, res) }
  catch {
    res.status(503).json({ error: { code: 'UNAVAILABLE', message: 'Service unavailable.', fieldErrors: {} } })
  }
})
export default app
