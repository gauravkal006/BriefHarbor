import * as contract from '@briefharbor/contracts'
import type { CaseInput, FactInput, InquiryInput, InquiryEdit, CaseFilters, Schema } from '@briefharbor/contracts'

import { ApiError } from './api-error'
import { demoApi } from './demo-api'
import { isDemo } from './demo-mode'

export { ApiError } from './api-error'
async function request<T>(path: string, schema: Schema<T>, options?: RequestInit): Promise<T> {
  let response: Response
  try {
    response = await fetch('/api' + path, { credentials: 'same-origin', cache: 'no-store', ...options })
  } catch { throw new ApiError('Could not connect to BriefHarbor.', 503) }
  const body: unknown = await response.json().catch(() => null)
  if (!response.ok) {
    const parsed = contract.failure.safeParse(body)
    throw new ApiError(parsed.success ? parsed.data.error.message : 'The workspace is temporarily unavailable.',
      response.status, parsed.success ? parsed.data.error.fieldErrors : {})
  }
  const parsed = contract.result(schema).safeParse(body)
  if (!parsed.success) throw new ApiError('BriefHarbor received an unexpected response.', 502)
  return parsed.data.data
}
async function mutate<T>(path: string, method: 'POST' | 'PATCH', schema: Schema<T>, data?: unknown) {
  const { token } = await request('/auth/csrf', contract.csrf)
  return request(path, schema, {
    method, headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': token }, body: JSON.stringify(data ?? {}),
  })
}
const casePath = (id: string) => '/cases/' + encodeURIComponent(id)

const liveApi = {
  session: () => request('/auth/session', contract.account),
  login: (email: string, password: string) => mutate('/auth/login', 'POST', contract.account, { email, password }),
  logout: () => mutate('/auth/logout', 'POST', contract.signedOut),
  clients: () => request('/clients', contract.clients),
  cases: (filters: CaseFilters) => {
    const query = new URLSearchParams()
    for (const [key, value] of Object.entries(filters)) if (value !== undefined) query.set(key, value)
    return request('/cases?' + query, contract.cases)
  },
  detail: (id: string) => request(casePath(id), contract.caseDetail),
  create: (data: CaseInput) => mutate('/cases', 'POST', contract.caseSummary, data),
  addFact: (id: string, data: FactInput) => mutate(casePath(id) + '/facts', 'POST', contract.fact, data),
  verify: (caseId: string, id: string, share: boolean) => mutate(casePath(caseId) + '/facts/' + encodeURIComponent(id), 'PATCH',
    contract.fact, { status: 'VERIFIED', visibility: share ? 'SHAREABLE' : 'INTERNAL' }),
  addInquiry: (id: string, data: InquiryInput) => mutate(casePath(id) + '/inquiries', 'POST', contract.inquiry, data),
  editInquiry: (caseId: string, id: string, data: InquiryEdit) => mutate(casePath(caseId) + '/inquiries/' + encodeURIComponent(id),
    'PATCH', contract.inquiry, data),
}

export const api: typeof liveApi = isDemo ? { ...liveApi, ...demoApi } : liveApi
