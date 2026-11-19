import * as contract from '@briefharbor/contracts'
import type { CaseInput, FactInput, InquiryInput, InquiryEdit, CaseFilters, Schema } from '@briefharbor/contracts'

import { ApiError } from './api-error'
import { demoApi } from './demo-api'
import { demoWorkflowApi } from './demo-workflow'
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
async function mutate<T>(path: string, method: 'POST' | 'PATCH', schema: Schema<T>, data?: unknown, headers?: Record<string, string>) {
  const { token } = await request('/auth/csrf', contract.csrf)
  return request(path, schema, {
    method, headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': token, ...headers }, body: JSON.stringify(data ?? {}),
  })
}
const casePath = (id: string) => '/cases/' + encodeURIComponent(id)

async function download(path: string, method: 'GET' | 'POST') {
  const headers: Record<string, string> = {}
  if (method === 'POST') headers['X-CSRF-Token'] = (await request('/auth/csrf', contract.csrf)).token
  const response = await fetch('/api' + path, { method, headers, credentials: 'same-origin', cache: 'no-store' })
  if (!response.ok) {
    const body = contract.failure.safeParse(await response.json().catch(() => null))
    throw new ApiError(body.success ? body.data.error.message : 'The download failed.', response.status)
  }
  return response.text()
}

const liveApi = {
  workflow: (id: string) => request(casePath(id) + '/workflow', contract.workflowDto),
  statement: (id: string) => request('/statements/' + id, contract.statementDetailDto),
  createStatement: (id: string, data: contract.StatementInput) => mutate(casePath(id) + '/statements', 'POST', contract.statementDto, data),
  saveDraft: (id: string, data: contract.DraftInput) => mutate('/statements/' + id + '/draft', 'PATCH', contract.statementDto, data),
  submit: (id: string, data: contract.RevisionInput) => mutate('/statements/' + id + '/revisions', 'POST', contract.revisionDto, data),
  decide: (id: string, data: contract.DecisionInput) => mutate('/revisions/' + id + '/decisions', 'POST', contract.revisionDto, data),
  export: (id: string) => download('/revisions/' + id + '/exports', 'POST'),
  report: (id: string) => download(casePath(id) + '/report', 'GET'),
  deliver: (id: string, data: contract.DeliveryInput, key: string) => mutate(casePath(id) + '/deliveries', 'POST', contract.deliveryDto, data, { 'Idempotency-Key': key }),
  addTask: (id: string, data: contract.TaskInput) => mutate(casePath(id) + '/tasks', 'POST', contract.taskDto, data),
  editTask: (id: string, taskId: string, data: contract.TaskEdit) => mutate(casePath(id) + '/tasks/' + taskId, 'PATCH', contract.taskDto, data),
  changeCase: (id: string, data: contract.CaseEdit) => mutate(casePath(id), 'PATCH', contract.acknowledgement, data),
  assign: (id: string, data: contract.AssignmentInput) => mutate(casePath(id) + '/assignments', 'POST', contract.acknowledgement, data),
  evidence: (id: string, factId: string, data: contract.EvidenceEdit) => mutate(casePath(id) + '/facts/' + factId + '/evidence', 'POST', contract.acknowledgement, data),
  session: () => request('/auth/session', contract.account),
  signup: (data: contract.Registration) => mutate('/auth/signup', 'POST', contract.account, data),
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

export const api: typeof liveApi = isDemo ? { ...liveApi, ...demoApi, ...demoWorkflowApi } : liveApi
