'use client'

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import type { Account } from '@briefharbor/contracts'
import { api, ApiError } from '../lib/api'

const Session = createContext<{
  account: Account | null; loading: boolean; error: string; refresh: () => Promise<void>;
  setAccount: (account: Account | null) => void;
} | null>(null)

export function SessionProvider({ children }: { children: ReactNode }) {
  const [account, updateAccount] = useState<Account | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const request = useRef(0)
  const setAccount = useCallback((value: Account | null) => {
    request.current += 1
    updateAccount(value)
    setError('')
    setLoading(false)
  }, [])
  const refresh = useCallback(async () => {
    const started = ++request.current
    setLoading(true)
    setError('')
    try {
      const result = await api.session()
      if (started === request.current) updateAccount(result)
    } catch (error) {
      if (started !== request.current) return
      updateAccount(null)
      if (!(error instanceof ApiError && error.status === 401)) setError('The workspace is temporarily unavailable.')
    } finally {
      if (started === request.current) setLoading(false)
    }
  }, [])
  useEffect(() => { void refresh() }, [refresh])
  return <Session.Provider value={{ account, loading, error, refresh, setAccount }}>{children}</Session.Provider>
}
export function useSession() {
  const session = useContext(Session)
  if (!session) throw new Error('Missing session provider')
  return session
}
