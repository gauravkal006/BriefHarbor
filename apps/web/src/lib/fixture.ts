import type { Account, CaseDetail, CaseSummary, Client } from '@briefharbor/contracts'

export const profile: Account = { id: '000000000000000000000001', email: 'coordinator@riverstone.example.test', name: 'Maya Chen' }
export const demoClient: Client = {
  id: '000000000000000000000002', name: 'Riverstone Retail', synthetic: true,
  members: [{ id: profile.id, name: profile.name, roles: ['COORDINATOR'] }], roles: ['COORDINATOR'],
}
export const demoSummary: CaseSummary = {
  id: '000000000000000000000003', title: 'Customer portal access restriction',
  clientId: demoClient.id, type: 'DATA_BREACH', severity: 'HIGH', status: 'ACTIVE',
  ownerId: profile.id, nextUpdateAt: '2026-11-17T05:30:00.000Z',
  nearestInquiryDeadlineAt: '2026-11-16T05:00:00.000Z', synthetic: true,
}
export const demoCase: CaseDetail = {
  ...demoSummary, facts: [], inquiries: [], members: demoClient.members, roles: demoClient.roles, factOwnerOptions: [],
}
