import { config } from './config.js'
import { connect } from './db/index.js'
import { createApp } from './app.js'

try {
  const options = config()
  const db = await connect(options)
  const server = createApp(db, options).listen(options.port, '127.0.0.1', () => {
    console.log('BriefHarbor API listening on port ' + options.port)
  })
  const stop = () => server.close(() => { void db.client.close() })
  process.once('SIGINT', stop)
  process.once('SIGTERM', stop)
} catch (error) {
  const message = error instanceof Error && /^(Set |Check |Production |MongoDB must)/.test(error.message) ? error.message : 'Check the MongoDB connection and database permissions.'
  console.error('BriefHarbor could not start. ' + message)
  process.exitCode = 1
}
