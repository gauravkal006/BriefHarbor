import { z } from 'zod'

export const id = z.string().regex(/^[a-f0-9]{24}$/i, 'Invalid record ID').transform(value => value.toLowerCase())
export const date = z.iso.datetime()
export const severity = z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'])
export const caseStatus = z.enum(['NEW', 'ACTIVE', 'MONITORING', 'CLOSED'])
export const caseType = z.enum(['DATA_BREACH', 'LAWSUIT', 'EXECUTIVE_SCANDAL', 'HOSTILE_PUBLIC_EVENT'])
export const visibility = z.enum(['INTERNAL', 'SHAREABLE'])
export const role = z.enum(['COORDINATOR', 'FACT_OWNER', 'PR_LEAD', 'LEGAL_REVIEWER', 'CLIENT_REVIEWER', 'VIEWER'])
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


export const reviewerRole = z.enum(['PR_LEAD', 'LEGAL_REVIEWER', 'CLIENT_REVIEWER'])
export const reviewState = z.enum(['IN_REVIEW', 'CHANGES_REQUESTED', 'APPROVED'])
export const statementInput = z.strictObject({ audience: line(160), inquiryId: id.optional() })
export const draftInput = z.strictObject({ text: line(12000), expectedVersion: z.number().int().min(0) })
export const revisionInput = z.strictObject({
  expectedVersion: z.number().int().min(0), factVersionIds: z.array(id).min(1).max(30),
  reviewers: z.array(z.strictObject({ userId: id, role: reviewerRole })).min(1).max(3),
})
export const decisionInput = z.strictObject({
  decision: z.enum(['APPROVE', 'REQUEST_CHANGES']), comment: z.string().trim().max(2000).default(''),
}).refine(value => value.decision !== 'REQUEST_CHANGES' || value.comment.length > 0, {
  path: ['comment'], message: 'Explain the changes required.',
})
export const taskInput = z.strictObject({ title: line(300), assigneeId: id, deadlineAt: date })
export const taskEdit = z.strictObject({ status: z.enum(['OPEN', 'DONE']), reason: line(500).optional() })
export const caseEdit = z.strictObject({
  status: caseStatus, reason: line(1000), sensitiveClaims: z.boolean().optional(), personnelStatement: z.boolean().optional(),
})
export const assignmentInput = z.strictObject({ userId: id, role })
export const evidenceEdit = z.discriminatedUnion('action', [
  z.strictObject({ action: z.literal('RESTRICT'), reason: line(1000) }),
  z.strictObject({ action: z.literal('SHARE'), reason: line(1000) }),
  z.strictObject({ action: z.literal('SUPERSEDE'), reason: line(1000), claim: line(2000), source: line(500) }),
])
export const deliveryInput = z.strictObject({
  revisionId: id, inquiryId: id.optional(), audience: line(160).optional(),
  channel: z.enum(['EMAIL', 'PHONE', 'PORTAL', 'OTHER']), sentAt: date,
}).refine(value => Boolean(value.inquiryId) !== Boolean(value.audience), 'Choose an inquiry or an audience.')
  .refine(value => Date.parse(value.sentAt) <= Date.now() + 60_000, { path: ['sentAt'], message: 'Enter an actual send time.' })
export const statementDto = z.object({
  id, caseId: id, audience: z.string(), inquiryId: id.nullable(), draft: z.string(),
  draftVersion: z.number().int(), authorId: id, currentRevisionId: id.nullable(),
})
export const revisionDto = z.object({
  id, statementId: id, caseId: id, version: z.number().int(), text: z.string(), authorId: id,
  submittedAt: date, factVersionIds: z.array(id), state: reviewState,
  reviewers: z.array(z.object({ userId: id, role: reviewerRole })),
  decisions: z.array(z.object({ userId: id, decision: z.enum(['APPROVE', 'REQUEST_CHANGES']), comment: z.string(), at: date })),
})
export const taskDto = taskInput.extend({ id, status: z.enum(['OPEN', 'DONE']), reason: z.string().nullable() })
export const deliveryDto = z.object({
  id, revisionId: id, inquiryId: id.nullable(), audience: z.string().nullable(),
  channel: z.string(), sentAt: date, actorId: id, followUp: z.boolean(), idempotencyKey: z.string(),
})
export const auditDto = z.object({ id, actorId: id, targetId: id, action: z.string(), at: date, reason: z.string().optional() })
export const workflowDto = z.object({
  statements: z.array(statementDto), revisions: z.array(revisionDto), tasks: z.array(taskDto),
  deliveries: z.array(deliveryDto), timeline: z.array(auditDto), members: z.array(person),
  status: caseStatus, sensitiveClaims: z.boolean(), personnelStatement: z.boolean(),
})
export const statementDetailDto = z.object({ statement: statementDto, revisions: z.array(revisionDto) })
export const scenarioTemplates = {
  DATA_BREACH: { title: 'Suspected data breach', evidence: 'Confirm the restriction, services affected, and security incident reference. Keep affected record counts unknown until verified.', reviewers: 'PR and legal review required.' },
  LAWSUIT: { title: 'Lawsuit response', evidence: 'Record the filing reference, allegations, jurisdiction, and verified procedural status.', reviewers: 'PR and legal review required.' },
  EXECUTIVE_SCANDAL: { title: 'Executive incident', evidence: 'Record the original source, confirmed organizational action, and HR or board owner.', reviewers: 'PR and legal required. Personnel statements also require a named client reviewer.' },
  HOSTILE_PUBLIC_EVENT: { title: 'Public event disruption', evidence: 'Confirm the venue, time, observed impact, and onsite contact.', reviewers: 'PR required. Sensitive claims also require legal review.' },
} as const
export type Workflow = z.infer<typeof workflowDto>
export type StatementDto = z.infer<typeof statementDto>
export type RevisionDto = z.infer<typeof revisionDto>
export type TaskDto = z.infer<typeof taskDto>
export type DeliveryDto = z.infer<typeof deliveryDto>
export type ReviewerRole = z.infer<typeof reviewerRole>

export const idempotencyKey = z.string().min(8).max(120).regex(/^[a-zA-Z0-9_-]+$/)

export function reviewerPolicy(type: z.infer<typeof caseType>, sensitiveClaims = false, personnelStatement = false): ReviewerRole[] {
  const roles: ReviewerRole[] = ['PR_LEAD']
  if (type !== 'HOSTILE_PUBLIC_EVENT' || sensitiveClaims) roles.push('LEGAL_REVIEWER')
  if (type === 'EXECUTIVE_SCANDAL' && personnelStatement) roles.push('CLIENT_REVIEWER')
  return roles
}
export const acknowledgement = z.object({ ok: z.literal(true) })

export type StatementInput = z.infer<typeof statementInput>
export type DraftInput = z.infer<typeof draftInput>
export type RevisionInput = z.infer<typeof revisionInput>
export type DecisionInput = z.infer<typeof decisionInput>
export type DeliveryInput = z.infer<typeof deliveryInput>
export type TaskInput = z.infer<typeof taskInput>
export type TaskEdit = z.infer<typeof taskEdit>
export type CaseEdit = z.infer<typeof caseEdit>
export type AssignmentInput = z.infer<typeof assignmentInput>
export type EvidenceEdit = z.infer<typeof evidenceEdit>

