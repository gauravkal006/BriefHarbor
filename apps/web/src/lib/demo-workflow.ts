import * as contract from '@briefharbor/contracts'
import { ApiError } from './api-error'
import { demoActor, demoRoles, readDemoCases, saveDemoCases, updateDemoCase } from './demo-api'

const key = 'briefharbor.workflow.v1'
type Stored = contract.Workflow & { exported: string[]; fingerprints: Record<string, string> }
const id = () => crypto.randomUUID().replaceAll('-', '').slice(0, 24)
function read(caseId: string): Stored {
  const record = readDemoCases().find(item => item.id === caseId)
  if (!record) throw new ApiError('Case unavailable.', 404)
  const all = JSON.parse(localStorage.getItem(key) ?? '{}') as Record<string, Stored>
  return all[caseId] ?? { statements: [], revisions: [], tasks: [], deliveries: [], timeline: [], members: record.members,
    status: record.status, sensitiveClaims: false, personnelStatement: false, exported: [], fingerprints: {} }
}
function save(caseId: string, state: Stored, action: string, targetId: string, reason = '') {
  state.timeline.unshift({ id: id(), at: new Date().toISOString(), actorId: demoActor().id, targetId, action, reason })
  const all = JSON.parse(localStorage.getItem(key) ?? '{}')
  all[caseId] = state
  localStorage.setItem(key, JSON.stringify(all))
}
function role(required: contract.Role) {
  if (!demoRoles().includes(required)) throw new ApiError('Switch to the assigned role to make this change.', 403)
}
function open(state: Stored) { if (state.status === 'CLOSED') throw new ApiError('This case is closed.', 409) }
function validate<T>(schema: contract.Schema<T>, input: unknown): T {
  const parsed = schema.safeParse(input)
  if (!parsed.success) throw new ApiError('Check the submitted fields.', 422,
    Object.fromEntries(parsed.error.issues.map(issue => [issue.path.join('.'), issue.message])))
  return parsed.data
}
function findStatement(statementId: string) {
  for (const record of readDemoCases()) {
    const state = read(record.id)
    const statement = state.statements.find(item => item.id === statementId)
    if (statement) return { state, statement, caseId: record.id }
  }
  throw new ApiError('Statement unavailable.', 404)
}
function findRevision(revisionId: string) {
  for (const record of readDemoCases()) {
    const state = read(record.id)
    const revision = state.revisions.find(item => item.id === revisionId)
    if (revision) {
      const statement = state.statements.find(item => item.id === revision.statementId)!
      return { state, revision, statement, caseId: record.id }
    }
  }
  throw new ApiError('Revision unavailable.', 404)
}
function evidence(caseId: string, factIds: string[]) {
  const facts = readDemoCases().find(item => item.id === caseId)!.facts
  if (!factIds.length || factIds.some(id => !facts.some(fact => fact.id === id && fact.status === 'VERIFIED' && fact.visibility === 'SHAREABLE'))) {
    throw new ApiError('Every cited fact must still be verified and shareable.', 409)
  }
}
function current(revision: contract.RevisionDto, statement: contract.StatementDto) {
  if (statement.currentRevisionId !== revision.id) throw new ApiError('This revision is no longer current.', 409)
}
export const demoWorkflowApi = {
  async workflow(caseId: string): Promise<contract.Workflow> { return read(caseId) },
  async statement(statementId: string) {
    const { state, statement } = findStatement(statementId)
    return { statement, revisions: state.revisions.filter(row => row.statementId === statementId) }
  },
  async createStatement(caseId: string, input: contract.StatementInput) {
    role('COORDINATOR')
    const state = read(caseId); open(state)
    const data = validate(contract.statementInput, input)
    const record = readDemoCases().find(item => item.id === caseId)!
    if (data.inquiryId && !record.inquiries.some(item => item.id === data.inquiryId)) throw new ApiError('Inquiry unavailable.', 404)
    const statement: contract.StatementDto = { id: id(), caseId, audience: data.audience, inquiryId: data.inquiryId ?? null,
      draft: '', draftVersion: 0, authorId: demoActor().id, currentRevisionId: null }
    state.statements.push(statement)
    save(caseId, state, 'STATEMENT_CREATED', statement.id)
    return statement
  },
  async saveDraft(statementId: string, input: contract.DraftInput) {
    role('COORDINATOR')
    const data = validate(contract.draftInput, input)
    const { state, statement, caseId } = findStatement(statementId); open(state)
    if (statement.authorId !== demoActor().id) throw new ApiError('Only the author can edit.', 403)
    if (statement.draftVersion !== data.expectedVersion) throw new ApiError('The draft changed. Reload.', 409)
    statement.draft = data.text; statement.draftVersion++
    save(caseId, state, 'DRAFT_SAVED', statementId)
    return statement
  },
  async submit(statementId: string, input: contract.RevisionInput) {
    role('COORDINATOR')
    const data = validate(contract.revisionInput, input)
    const { state, statement, caseId } = findStatement(statementId); open(state)
    const record = readDemoCases().find(item => item.id === caseId)!
    const policy = contract.reviewerPolicy(record.type, state.sensitiveClaims, state.personnelStatement)
    if (statement.authorId !== demoActor().id) throw new ApiError('Only the author can submit.', 403)
    if (!statement.draft || statement.draftVersion !== data.expectedVersion) throw new ApiError('Save the current draft first.', 409)
    if (data.reviewers.length !== policy.length || new Set(data.reviewers.map(row => row.userId)).size !== policy.length ||
        policy.some(role => !data.reviewers.some(row => row.role === role)) ||
        data.reviewers.some(row => row.userId === statement.authorId ||
          !state.members.some(member => member.id === row.userId && member.roles.includes(row.role)))) {
      throw new ApiError('Choose distinct assigned reviewers for every required role.', 409)
    }
    evidence(caseId, data.factVersionIds)
    const revision: contract.RevisionDto = { id: id(), caseId, statementId, text: statement.draft, authorId: statement.authorId,
      version: state.revisions.filter(item => item.statementId === statementId).length + 1, factVersionIds: [...new Set(data.factVersionIds)],
      reviewers: data.reviewers, state: 'IN_REVIEW', submittedAt: new Date().toISOString(), decisions: [] }
    state.revisions.unshift(revision); statement.currentRevisionId = revision.id; statement.draftVersion++
    save(caseId, state, 'REVISION_SUBMITTED', revision.id)
    return revision
  },
  async decide(revisionId: string, input: contract.DecisionInput) {
    const data = validate(contract.decisionInput, input)
    const { state, revision, statement, caseId } = findRevision(revisionId); open(state); current(revision, statement)
    if (revision.state !== 'IN_REVIEW') throw new ApiError('Review has ended.', 409)
    const reviewer = revision.reviewers.find(row => row.userId === demoActor().id)
    if (!reviewer || !demoRoles().includes(reviewer.role) || revision.authorId === demoActor().id) throw new ApiError('Only the named reviewer can decide.', 403)
    if (revision.decisions.some(row => row.userId === demoActor().id)) throw new ApiError('Decision already recorded.', 409)
    revision.decisions.push({ ...data, userId: demoActor().id, at: new Date().toISOString() })
    revision.state = data.decision === 'REQUEST_CHANGES' ? 'CHANGES_REQUESTED' :
      revision.reviewers.every(row => revision.decisions.some(decision => decision.userId === row.userId && decision.decision === 'APPROVE')) ? 'APPROVED' : 'IN_REVIEW'
    save(caseId, state, data.decision, revisionId, data.comment)
    return revision
  },
  async export(revisionId: string) {
    role('COORDINATOR')
    const { state, revision, statement, caseId } = findRevision(revisionId); open(state); current(revision, statement)
    const record = readDemoCases().find(row => row.id === caseId)!
    const policy = contract.reviewerPolicy(record.type, state.sensitiveClaims, state.personnelStatement)
    if (revision.state !== 'APPROVED' || policy.some(role => !revision.reviewers.some(reviewer =>
      reviewer.role === role && revision.decisions.some(decision => decision.userId === reviewer.userId && decision.decision === 'APPROVE')))) {
      throw new ApiError('Complete all required approvals before export.', 409)
    }
    evidence(caseId, revision.factVersionIds)
    state.exported.push(revisionId)
    save(caseId, state, 'EXPORTED', revisionId)
    return revision.text
  },
  async deliver(caseId: string, input: contract.DeliveryInput, deliveryKey: string) {
    role('COORDINATOR')
    const data = validate(contract.deliveryInput, input); validate(contract.idempotencyKey, deliveryKey)
    const state = read(caseId)
    const fingerprint = JSON.stringify(data)
    const previous = state.deliveries.find(row => row.idempotencyKey === deliveryKey)
    if (previous) {
      if (state.fingerprints[deliveryKey] !== fingerprint) throw new ApiError('This key was used with different delivery details.', 409)
      return previous
    }
    const revision = state.revisions.find(row => row.id === data.revisionId)
    if (!revision || !state.exported.includes(revision.id)) throw new ApiError('Export this revision before recording delivery.', 409)
    let followUp = false
    try { evidence(caseId, revision.factVersionIds) } catch { followUp = true }
    if (data.inquiryId) updateDemoCase(caseId, record => {
      const inquiry = record.inquiries.find(row => row.id === data.inquiryId)
      if (!inquiry) throw new ApiError('Inquiry unavailable.', 404)
      if (inquiry.status !== 'OPEN') throw new ApiError('Inquiry already resolved.', 409)
      inquiry.status = 'RESPONDED'
    })
    const delivery: contract.DeliveryDto = { ...data, id: id(), inquiryId: data.inquiryId ?? null, audience: data.audience ?? null,
      actorId: demoActor().id, followUp, idempotencyKey: deliveryKey }
    state.deliveries.push(delivery); state.fingerprints[deliveryKey] = fingerprint
    save(caseId, state, 'DELIVERY_RECORDED', delivery.id)
    return delivery
  },
  async addTask(caseId: string, input: contract.TaskInput) {
    if (!demoRoles().some(role => role === 'COORDINATOR' || role === 'PR_LEAD')) throw new ApiError('Permission denied.', 403)
    const state = read(caseId); open(state)
    const data = validate(contract.taskInput, input)
    if (!state.members.some(row => row.id === data.assigneeId)) throw new ApiError('Choose an assigned member.', 422)
    const task: contract.TaskDto = { ...data, id: id(), status: 'OPEN', reason: null }
    state.tasks.push(task); save(caseId, state, 'TASK_CREATED', task.id)
    return task
  },
  async editTask(caseId: string, taskId: string, input: contract.TaskEdit) {
    const state = read(caseId); open(state)
    const task = state.tasks.find(row => row.id === taskId)
    if (!task) throw new ApiError('Task unavailable.', 404)
    if (task.assigneeId !== demoActor().id && !demoRoles().includes('PR_LEAD')) throw new ApiError('Only the assignee or PR lead can update.', 403)
    const data = validate(contract.taskEdit, input)
    Object.assign(task, data)
    save(caseId, state, 'TASK_UPDATED', taskId, data.reason)
    return task
  },
  async changeCase(caseId: string, input: contract.CaseEdit) {
    role('PR_LEAD')
    const data = validate(contract.caseEdit, input), state = read(caseId)
    const cases = readDemoCases(), record = cases.find(row => row.id === caseId)!
    if (data.status === 'CLOSED' && (record.inquiries.some(row => row.status === 'OPEN') ||
      state.revisions.some(row => row.state === 'IN_REVIEW' && state.statements.some(statement => statement.currentRevisionId === row.id)))) throw new ApiError('Resolve open inquiries and pending reviews before closing.', 409)
    state.status = data.status
    if (data.sensitiveClaims !== undefined) state.sensitiveClaims = data.sensitiveClaims
    if (data.personnelStatement !== undefined) state.personnelStatement = data.personnelStatement
    record.status = data.status; saveDemoCases(cases)
    save(caseId, state, 'CASE_UPDATED', caseId, data.reason)
    return { ok: true as const }
  },
  async assign(caseId: string, input: contract.AssignmentInput) {
    role('COORDINATOR'); validate(contract.assignmentInput, input)
    const state = read(caseId)
    if (!state.members.some(row => row.id === input.userId && row.roles.includes(input.role))) throw new ApiError('Choose an eligible member.', 422)
    return { ok: true as const }
  },
  async evidence(caseId: string, factId: string, input: contract.EvidenceEdit) {
    role('FACT_OWNER')
    const data = validate(contract.evidenceEdit, input), state = read(caseId); open(state)
    updateDemoCase(caseId, record => {
      const fact = record.facts.find(row => row.id === factId)
      if (!fact) throw new ApiError('Fact unavailable.', 404)
      if (fact.ownerId !== demoActor().id) throw new ApiError('Only the fact owner can change evidence.', 403)
      if (fact.status === 'SUPERSEDED') throw new ApiError('Already superseded.', 409)
      if (data.action === 'SHARE') {
        if (fact.status !== 'VERIFIED') throw new ApiError('Verify the fact before marking it shareable.', 409)
        fact.visibility = 'SHAREABLE'
      } else if (data.action === 'RESTRICT') fact.visibility = 'INTERNAL'
      else {
        fact.status = 'SUPERSEDED'
        record.facts.push({ ...fact, id: id(), version: fact.version + 1, claim: data.claim, source: data.source,
          status: 'UNVERIFIED', visibility: 'INTERNAL', verifierId: null, verifiedAt: null })
      }
    })
    for (const delivery of state.deliveries) {
      if (data.action !== 'SHARE' && state.revisions.some(row => row.id === delivery.revisionId && row.factVersionIds.includes(factId))) delivery.followUp = true
    }
    save(caseId, state, data.action === 'SUPERSEDE' ? 'FACT_SUPERSEDED' : data.action === 'SHARE' ? 'FACT_SHARED' : 'FACT_RESTRICTED', factId, data.reason)
    return { ok: true as const }
  },
  async report(caseId: string) {
    const state = read(caseId)
    return JSON.stringify({ title: readDemoCases().find(row => row.id === caseId)!.title,
      status: state.status, revisions: state.revisions, timeline: state.timeline, tasks: state.tasks, deliveries: state.deliveries }, null, 2)
  },
}

