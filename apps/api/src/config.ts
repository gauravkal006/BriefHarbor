export function config() {
  const { MONGODB_URI, MONGODB_DB, SESSION_SECRET, WEB_ORIGIN } = process.env
  if (!MONGODB_URI || !MONGODB_DB || !SESSION_SECRET || SESSION_SECRET.length < 32 || !WEB_ORIGIN) {
    throw new Error('Set MONGODB_URI, MONGODB_DB, WEB_ORIGIN and a SESSION_SECRET of at least 32 characters.')
  }
  const origin = new URL(WEB_ORIGIN)
  const port = Number(process.env.PORT ?? 4000)
  const proxyHops = Number(process.env.TRUST_PROXY_HOPS ?? 0)
  if (!/^https?:$/.test(origin.protocol) || origin.origin !== WEB_ORIGIN ||
    !Number.isInteger(port) || port < 1 || port > 65535 || !Number.isInteger(proxyHops) || proxyHops < 0) {
    throw new Error('Check WEB_ORIGIN, PORT and TRUST_PROXY_HOPS.')
  }
  if (process.env.NODE_ENV === 'production' && origin.protocol !== 'https:') throw new Error('Production requires an HTTPS WEB_ORIGIN.')
  return { uri: MONGODB_URI, dbName: MONGODB_DB, secret: SESSION_SECRET, origin: WEB_ORIGIN, proxyHops, port, secure: origin.protocol === 'https:' }
}
export type Config = ReturnType<typeof config>
