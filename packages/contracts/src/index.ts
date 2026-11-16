import { z } from 'zod'

export const id = z.string().regex(/^[a-f0-9]{24}$/i, 'Invalid record ID').transform(value => value.toLowerCase())
export const date = z.iso.datetime()
export const severity = z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'])
export const caseStatus = z.enum(['NEW', 'ACTIVE', 'MONITORING', 'CLOSED'])
export const caseType = z.enum(['DATA_BREACH', 'LAWSUIT', 'EXECUTIVE_SCANDAL', 'HOSTILE_PUBLIC_EVENT'])
export const visibility = z.enum(['INTERNAL', 'SHAREABLE'])
export const role = z.enum(['COORDINATOR', 'FACT_OWNER', 'PR_LEAD', 'LEGAL_REVIEWER', 'VIEWER'])
export const inquiryStatus = z.enum(['OPEN', 'RESPONDED', 'CLOSED_WITHOUT_RESPONSE'])
const line = (max: number) => z.string().trim().min(1, 'Required').max(max)

export const login = z.strictObject({ email: z.email().max(254), password: z.string().min(1).max(256) })
export const caseInput = z.strictObject({
  clientId: id, title: line(160), type: caseType, severity, ownerId: id, nextUpdateAt: date,
})
export const caseFilters = z.strictObject({
  clientId: id, status: caseStatus.optional(), severity: severity.optional(), type: caseType.optional(),
})
export const factInput = z.strictObject({ claim: line(2000), source: line(500), ownerId: id, visibility })
export const factEdit = z.strictObject({ status: z.literal('VERIFIED'), visibility: visibility.optional() })
export const inquiryInput = z.strictObject({
  outlet: line(160), contact: line(254), question: line(2000), ownerId: id, deadlineAt: date,
})
export const inquiryEdit = inquiryInput.pick({ ownerId: true, deadlineAt: true }).partial().extend({
  status: z.literal('CLOSED_WITHOUT_RESPONSE').optional(), closureReason: line(500).optional(),
}).refine(value => Object.keys(value).length > 0, 'Enter a change')
  .refine(value => Boolean(value.status) === Boolean(value.closureReason), {
    path: ['closureReason'], message: 'A closure reason is required when closing an inquiry',
  })

export const person = z.object({ id, name: z.string(), roles: z.array(role) })
export const client = z.object({ id, name: z.string(), synthetic: z.boolean(), members: z.array(person), roles: z.array(role) })
export const account = z.object({ id, name: z.string(), email: z.email() })
export const csrf = z.object({ token: z.string() })
export const signedOut = z.object({ signedOut: z.literal(true) })
export const caseSummary = caseInput.extend({
  id, status: caseStatus, synthetic: z.boolean(), nearestInquiryDeadlineAt: date.nullable(),
})
export const fact = factInput.extend({
  id, logicalFactId: id, version: z.number().int(), status: z.enum(['UNVERIFIED', 'VERIFIED', 'SUPERSEDED']),
  verifierId: id.nullable(), verifiedAt: date.nullable(),
})
export const inquiry = inquiryInput.extend({
  id, status: inquiryStatus, closureReason: z.string().nullable(),
})
export const caseDetail = caseSummary.extend({
  facts: z.array(fact), inquiries: z.array(inquiry), members: z.array(person), roles: z.array(role),
  factOwnerOptions: z.array(person),
})
export const result = <T extends z.ZodType>(schema: T) => z.object({ data: schema })
export const failure = z.object({ error: z.object({
  code: z.string(), message: z.string(), fieldErrors: z.record(z.string(), z.string()),
}) })

export type Client = z.infer<typeof client>
export type Account = z.infer<typeof account>
export type CaseSummary = z.infer<typeof caseSummary>
export type CaseDetail = z.infer<typeof caseDetail>
export type Fact = z.infer<typeof fact>
export type Inquiry = z.infer<typeof inquiry>
export type Person = z.infer<typeof person>
export type Role = z.infer<typeof role>
export type CaseInput = z.infer<typeof caseInput>
export type FactInput = z.infer<typeof factInput>
export type InquiryInput = z.infer<typeof inquiryInput>
export type InquiryEdit = z.infer<typeof inquiryEdit>
export type CaseFilters = z.infer<typeof caseFilters>
export type Schema<T> = z.ZodType<T>
export const clients = z.array(client)
export const cases = z.array(caseSummary)

