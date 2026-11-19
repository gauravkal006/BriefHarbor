import * as contract from '@briefharbor/contracts'
import type { CaseDetail, CaseFilters, CaseInput, Fact, FactInput, Inquiry, InquiryEdit, InquiryInput, Person } from '@briefharbor/contracts'
import { ApiError } from './api-error'
import { demoCase, demoClient, profile } from './fixture'

const key = 'briefharbor.recruiter.v1'
const profileKey = 'briefharbor.demo-profile.v1'
const analyst: Person = { id: '000000000000000000000004', name: 'Samir Rao', roles: ['FACT_OWNER'] }
const reviewers: Person[] = [
  { id: '000000000000000000000007', name: 'Ellis Morgan', roles: ['PR_LEAD'] },
  { id: '000000000000000000000008', name: 'Samira Bell', roles: ['LEGAL_REVIEWER'] },
  { id: '000000000000000000000009', name: 'Robin Taylor', roles: ['CLIENT_REVIEWER'] },
]
const members: Person[] = [...demoClient.members, analyst, ...reviewers]
const client = { ...demoClient, members }
const analystAccount = { id: analyst.id, name: analyst.name, email: 'facts@riverstone.example.test' }
export type DemoRole = 'coordinator' | 'analyst' | 'pr' | 'legal' | 'client'

export function getRole(): DemoRole {
  const role = sessionStorage.getItem(key)
  return role === 'analyst' || role === 'pr' || role === 'legal' || role === 'client' ? role : 'coordinator'
}
export function demoActor() {
  const role = getRole()
  if (role === 'analyst') return analystAccount
  const reviewer = reviewers[{ pr: 0, legal: 1, client: 2 }[role as 'pr' | 'legal' | 'client']]
  return reviewer ? { id: reviewer.id, name: reviewer.name, email: role + '@riverstone.example.test' } : demoCoordinator()
}
function demoCoordinator() {
  try {
    const parsed = contract.demoProfile.safeParse(JSON.parse(localStorage.getItem(profileKey) ?? 'null'))
    if (parsed.success) return { ...profile, ...parsed.data }
  } catch { /* A guest can still explore if the stored profile is unreadable. */ }
  return profile
}
export function demoRoles() {
  return members.find(person => person.id === demoActor().id)?.roles ?? []
}
export function setDemoRole(role: DemoRole) { sessionStorage.setItem(key, role) }
export function resetDemo() { localStorage.removeItem(profileKey); localStorage.removeItem(key); localStorage.removeItem('briefharbor.workflow.v1'); setDemoRole('coordinator') }

function seed(): CaseDetail[] {
  const at = (minutes: number) => new Date(Date.now() + minutes * 60_000).toISOString()
  return [{
    ...demoCase, members, factOwnerOptions: [analyst],
    nextUpdateAt: at(60), nearestInquiryDeadlineAt: at(-20),
    facts: [{
      id: '000000000000000000000005', logicalFactId: '000000000000000000000005', version: 1,
      claim: 'Riverstone restricted access to its customer portal while the security team investigates.',
      source: 'Synthetic incident log IR-014', ownerId: analyst.id, status: 'UNVERIFIED', visibility: 'INTERNAL',
      verifierId: null, verifiedAt: null,
    }],
    inquiries: [{
      id: '000000000000000000000006', outlet: 'The Ledger Desk', contact: 'press@ledgerdesk.example.test',
      question: 'Can Riverstone confirm why the portal was restricted and whether customer records were affected?',
      ownerId: profile.id, deadlineAt: at(-20), status: 'OPEN', closureReason: null,
    }],
  }]
}

export function readDemoCases(): CaseDetail[] {
  const stored = localStorage.getItem(key)
  if (stored) {
    try {
      const parsed = contract.caseDetail.array().safeParse(JSON.parse(stored))
      if (parsed.success) return parsed.data.map(record => ({ ...record, members, factOwnerOptions: [analyst] }))
    } catch { /* Recreate an unreadable demo snapshot. */ }
  }
  const initial = seed()
  saveDemoCases(initial)
  return initial
}
export function saveDemoCases(cases: CaseDetail[]) { localStorage.setItem(key, JSON.stringify(cases)) }
function id() { return crypto.randomUUID().replaceAll('-', '').slice(0, 24) }
function missing(): never { throw new ApiError('This record is unavailable in the demo.', 404) }

function valid<T>(schema: contract.Schema<T>, input: unknown): T {
  const parsed = schema.safeParse(input)
  if (parsed.success) return parsed.data
  throw new ApiError('Check the highlighted fields.', 422, Object.fromEntries(
    parsed.error.issues.map(issue => [String(issue.path[0] ?? ''), issue.message]),
  ))
}

function coordinator() {
  if (getRole() !== 'coordinator') throw new ApiError('Switch to Coordinator to make this change.', 403)
}

export function updateDemoCase<T>(caseId: string, change: (record: CaseDetail) => T): T {
  const cases = readDemoCases()
  const record = cases.find(item => item.id === caseId) ?? missing()
  const result = change(record)
  record.nearestInquiryDeadlineAt = record.inquiries.filter(item => item.status === 'OPEN')
    .map(item => item.deadlineAt).sort()[0] ?? null
  saveDemoCases(cases)
  return result
}

export const demoApi = {
  async login(email: string, password: string) {
    void password
    const parsed = valid(contract.login.pick({ email: true }), { email })
    const current = demoCoordinator()
    localStorage.setItem(profileKey, JSON.stringify({ name: current.name, email: parsed.email.toLowerCase() }))
    setDemoRole('coordinator')
    return demoCoordinator()
  },
  async signup(input: contract.Registration) {
    const parsed = valid(contract.demoProfile, { name: input.name, email: input.email })
    localStorage.setItem(profileKey, JSON.stringify({ ...parsed, email: parsed.email.toLowerCase() }))
    setDemoRole('coordinator')
    return demoCoordinator()
  },
  async logout() {
    localStorage.removeItem(profileKey)
    setDemoRole('coordinator')
    return { signedOut: true as const }
  },
  async session() { return demoActor() },
  async clients() { return [{ ...client, roles: demoRoles() }] },
  async cases(filters: CaseFilters) {
    return readDemoCases().filter(item => item.clientId === filters.clientId &&
      (!filters.status || item.status === filters.status) && (!filters.severity || item.severity === filters.severity) &&
      (!filters.type || item.type === filters.type)).map(item => contract.caseSummary.parse(itemSummary(item)))
  },
  async detail(caseId: string) {
    const record = readDemoCases().find(item => item.id === caseId) ?? missing()
    return { ...record, roles: demoRoles() }
  },
  async create(input: CaseInput) {
    coordinator()
    const data = valid(contract.caseInput, input)
    const record: CaseDetail = {
      ...data, id: id(), status: 'NEW', synthetic: true, nearestInquiryDeadlineAt: null,
      roles: profileRoles(), members, facts: [], inquiries: [], factOwnerOptions: [analyst],
    }
    saveDemoCases([record, ...readDemoCases()])
    return record
  },
  async addFact(caseId: string, input: FactInput) {
    coordinator()
    const data = valid(contract.factInput, input)
    return updateDemoCase(caseId, record => {
      const factId = id()
      const fact: Fact = { ...data, id: factId, logicalFactId: factId, version: 1, status: 'UNVERIFIED', verifierId: null, verifiedAt: null }
      record.facts.push(fact)
      return fact
    })
  },
  async verify(caseId: string, factId: string, share: boolean) {
    if (getRole() !== 'analyst') throw new ApiError('Only the fact owner can verify this fact.', 403)
    return updateDemoCase(caseId, record => {
      const fact = record.facts.find(item => item.id === factId) ?? missing()
      if (fact.ownerId !== analyst.id || fact.status !== 'UNVERIFIED') throw new ApiError('This fact cannot be verified.', 409)
      fact.status = 'VERIFIED'
      fact.visibility = share ? 'SHAREABLE' : 'INTERNAL'
      fact.verifierId = analyst.id
      fact.verifiedAt = new Date().toISOString()
      return fact
    })
  },
  async addInquiry(caseId: string, input: InquiryInput) {
    coordinator()
    const data = valid(contract.inquiryInput, input)
    return updateDemoCase(caseId, record => {
      const inquiry: Inquiry = { ...data, id: id(), status: 'OPEN', closureReason: null }
      record.inquiries.push(inquiry)
      return inquiry
    })
  },
  async editInquiry(caseId: string, inquiryId: string, input: InquiryEdit) {
    coordinator()
    return updateDemoCase(caseId, record => {
      const inquiry = record.inquiries.find(item => item.id === inquiryId) ?? missing()
      if (inquiry.status !== 'OPEN') throw new ApiError('Only an open inquiry can be edited.', 409)
      return Object.assign(inquiry, valid(contract.inquiryEdit, input))
    })
  },
}

function profileRoles() { return demoClient.roles }

function itemSummary(item: CaseDetail) {
  const { id, title, clientId, type, severity, status, ownerId, nextUpdateAt, nearestInquiryDeadlineAt, synthetic } = item
  return { id, title, clientId, type, severity, status, ownerId, nextUpdateAt, nearestInquiryDeadlineAt, synthetic }
}
