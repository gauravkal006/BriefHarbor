'use client'
import { useEffect, useState } from 'react'

export function useLoad<T>(load: () => Promise<T>) {
  const [state, setState] = useState<{ data: T | null; error: string }>({ data: null, error: '' })
  useEffect(() => {
    let current = true
    setState({ data: null, error: '' })
    load().then(data => { if (current) setState({ data, error: '' }) },
      error => { if (current) setState({ data: null, error: error instanceof Error ? error.message : 'Could not load data.' }) })
    return () => { current = false }
  }, [load])
  return state
}
