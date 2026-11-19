'use client'
import { useCallback, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { demoCase } from '../lib/fixture'
import * as contract from '@briefharbor/contracts'
import { api } from '../lib/api'
import { caseHref, isDemo } from '../lib/demo-mode'
import { dateLabel, utc, label } from '../lib/format'
import { useLoad } from '../lib/use-load'
import { useSession } from './session'
import { ActionForm, Badge, Deadline, Field, inputProps, Notice, Owner, valueOf } from './ui'

export function saveText(text: string, filename: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url; link.download = filename; link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function WorkflowPanel({ record, onChange, initialView = 'statements', selectedStatementId }: {
  record: contract.CaseDetail; onChange: () => Promise<void>; initialView?: string; selectedStatementId?: string
}) {
  const [refresh, setRefresh] = useState(0)
  const load = useCallback(() => api.workflow(record.id), [record.id])
  const [notice, setNotice] = useState('')
  const [failure, setFailure] = useState('')
  const [view, setView] = useState(initialView)
  const { data, error } = useLoad(useCallback(() => { void refresh; return load() }, [load, refresh]))
  const { account } = useSession()
  const canWrite = record.roles.includes('COORDINATOR') && record.status !== 'CLOSED'
  const pr = record.roles.includes('PR_LEAD')
  const name = (id: string) => record.members.find(row => row.id === id)?.name ?? id
  async function change(action: () => Promise<unknown>, message: string) {
    setNotice(''); setFailure('')
    await action()
    setNotice(message); setRefresh(value => value + 1)
    await onChange()
  }
  async function download(action: () => Promise<string>, filename: string) {
    setFailure('')
    try { saveText(await action(), filename); setRefresh(value => value + 1) }
    catch (error) { setFailure(error instanceof Error ? error.message : 'Download failed.') }
  }
  const template = contract.scenarioTemplates[record.type]
  return <section className="panel padded workflow-panel">
    <nav className="tabs" aria-label="Response workflow">
      {['statements', 'tasks', 'report', 'settings'].map(item => <button key={item} aria-current={view === item ? 'page' : undefined}
        onClick={() => setView(item)}>{label(item)}</button>)}
    </nav>
    {notice && <Notice>{notice}</Notice>}{(error || failure) && <Notice error>{error || failure}</Notice>}
    {!data && !error && <Notice>Loading response workflow.</Notice>}
    {data && <>
      {view === 'statements' && <>
        <h2>Statements and review</h2>
        <p>{template.reviewers}</p>
        {!data.statements.length && <Notice>No statement drafts yet.</Notice>}
        {data.statements.filter(row => !selectedStatementId || row.id === selectedStatementId).map(statement =>
          <StatementEditor key={statement.id + ':' + statement.draftVersion} statement={statement} record={record}
            workflow={data} accountId={account?.id ?? ''} onChange={change} onDownload={download} />)}
        {canWrite && !selectedStatementId && <details className="entry"><summary>New statement</summary>
          <ActionForm submit="Create statement" onSubmit={form => change(() => api.createStatement(record.id, {
            audience: valueOf(form, 'audience'), ...(valueOf(form, 'inquiryId') ? { inquiryId: valueOf(form, 'inquiryId') } : {}),
          }), 'Statement created.')}>{errors => <>
            <Field title="Audience" name="audience" errors={errors}><input {...inputProps('audience', errors)} required maxLength={160} /></Field>
            <Field title="Related inquiry (optional)" name="inquiryId" errors={errors}><select {...inputProps('inquiryId', errors)}>
              <option value="">General statement</option>{record.inquiries.map(row => <option key={row.id} value={row.id}>{row.outlet}</option>)}
            </select></Field>
          </>}</ActionForm>
        </details>}
        {canWrite && <DeliveryForm record={record} workflow={data} change={change} />}
        <h3>Recorded deliveries</h3>
        {!data.deliveries.length && <p>No external deliveries recorded.</p>}
        {data.deliveries.map(row => <article className="record" key={row.id}>
          <strong>{row.audience ?? record.inquiries.find(item => item.id === row.inquiryId)?.outlet}</strong>
          <p>{row.channel} / {dateLabel(row.sentAt)} / {name(row.actorId)}</p>
          <p>Revision {row.revisionId}</p>{row.followUp && <Notice error>Follow-up required. Cited evidence has changed.</Notice>}
        </article>)}
      </>}
      {view === 'tasks' && <>
        <h2>Case tasks</h2>
        {!data.tasks.length && <Notice>No tasks assigned.</Notice>}
        {data.tasks.map(task => <article className="record" key={task.id}>
          <h3>{task.title}</h3><Badge value={task.status} /><p>Assigned to {name(task.assigneeId)}</p>
          <Deadline value={task.deadlineAt} active={task.status === 'OPEN'} />
          {(pr || task.assigneeId === account?.id) && record.status !== 'CLOSED' &&
            <ActionForm submit={task.status === 'OPEN' ? 'Mark done' : 'Reopen task'} onSubmit={() =>
              change(() => api.editTask(record.id, task.id, { status: task.status === 'OPEN' ? 'DONE' : 'OPEN' }), 'Task updated.')}>{() => null}</ActionForm>}
        </article>)}
        {(canWrite || pr) && record.status !== 'CLOSED' && <ActionForm submit="Add task" onSubmit={form => change(() => api.addTask(record.id, {
          title: valueOf(form, 'taskTitle'), assigneeId: valueOf(form, 'assigneeId'), deadlineAt: utc(valueOf(form, 'taskDeadline')),
        }), 'Task assigned.')}>{errors => <>
          <Field title="Task" name="taskTitle" errors={errors}><input {...inputProps('taskTitle', errors)} required maxLength={300} /></Field>
          <Owner name="assigneeId" title="Assignee" members={record.members} errors={errors} />
          <Field title="Deadline (local time)" name="taskDeadline" errors={errors}><input {...inputProps('taskDeadline', errors)} type="datetime-local" required /></Field>
        </>}</ActionForm>}
      </>}
      {view === 'report' && <>
        <h2>Case report</h2>{!isDemo && <Link className="text-link" href={caseHref(record.id) + "/report"}>Open report page</Link>}
        <button className="button" onClick={() => void download(() => api.report(record.id), 'briefharbor-report.txt')}>Download case report</button>
        <h3>Audit timeline</h3>
        {!data.timeline.length && <p>No events recorded.</p>}
        <ol className="audit-list">{data.timeline.map(row => <li key={row.id}>
          <strong>{label(row.action)}</strong><p>{dateLabel(row.at)} / {name(row.actorId)}</p>
          {row.reason && <p>{row.reason}</p>}<small>Record {row.targetId}</small>
        </li>)}</ol>
      </>}
      {view === 'settings' && <>
        <h2>Case coordination</h2>
        <p>{template.evidence}</p>
        {(canWrite || pr) && <AssignmentForm record={record} change={change} />}
        {pr ? <ActionForm submit="Update case" onSubmit={form => change(() => api.changeCase(record.id, {
          status: valueOf(form, 'status') as contract.CaseEdit['status'], reason: valueOf(form, 'reason'),
          sensitiveClaims: form.has('sensitiveClaims'), personnelStatement: form.has('personnelStatement'),
        }), 'Case updated.')}>{errors => <>
          <Field title="Case status" name="status" errors={errors}><select {...inputProps('status', errors)} defaultValue={record.status}>
            {contract.caseStatus.options.map(value => <option key={value}>{value}</option>)}</select></Field>
          <Field title="Reason for change, closure, or reopening" name="reason" errors={errors}><textarea {...inputProps('reason', errors)} required maxLength={1000} /></Field>
          {record.type === 'HOSTILE_PUBLIC_EVENT' && <label className="checkbox"><input type="checkbox" name="sensitiveClaims" defaultChecked={data.sensitiveClaims} />Sensitive claims require legal review</label>}
          {record.type === 'EXECUTIVE_SCANDAL' && <label className="checkbox"><input type="checkbox" name="personnelStatement" defaultChecked={data.personnelStatement} />Personnel statement requires client review</label>}
        </>}</ActionForm> : <Notice>The assigned PR lead can change case status and review policy.</Notice>}
      </>}
    </>}
  </section>
}

type Change = (action: () => Promise<unknown>, message: string) => Promise<void>
function AssignmentForm({ record, change }: { record: contract.CaseDetail; change: Change }) {
  const { data: clients } = useLoad(api.clients)
  const members = clients?.find(row => row.id === record.clientId)?.members ?? []
  return <details className="entry"><summary>Assign a client member to this case</summary>
    <ActionForm submit="Assign member" onSubmit={form => change(() => api.assign(record.id, {
      userId: valueOf(form, 'userId'), role: valueOf(form, 'role') as contract.Role,
    }), 'Member assigned.')}>{errors => <>
      <Owner name="userId" title="Client member" members={members} errors={errors} />
      <Field title="Case role" name="role" errors={errors}><select {...inputProps('role', errors)}>
        {contract.role.options.map(value => <option key={value}>{value}</option>)}</select></Field>
    </>}</ActionForm>
  </details>
}

function StatementEditor({ statement, record, workflow, accountId, onChange, onDownload }: {
  statement: contract.StatementDto; record: contract.CaseDetail; workflow: contract.Workflow; accountId: string;
  onChange: Change; onDownload: (action: () => Promise<string>, filename: string) => Promise<void>
}) {
  const canAuthor = record.roles.includes('COORDINATOR') && statement.authorId === accountId && record.status !== 'CLOSED'
  const policy = contract.reviewerPolicy(record.type, workflow.sensitiveClaims, workflow.personnelStatement)
  const revisions = workflow.revisions.filter(row => row.statementId === statement.id)
  const current = revisions.find(row => row.id === statement.currentRevisionId)
  const name = (id: string) => record.members.find(row => row.id === id)?.name ?? id
  return <article className="statement-editor">
    <h3>{statement.audience}</h3>{!isDemo && <Link className="text-link" href={caseHref(record.id) + "/statements/" + statement.id}>Open statement editor</Link>}
    {canAuthor && <ActionForm submit="Save draft" onSubmit={form => onChange(() => api.saveDraft(statement.id, {
      text: valueOf(form, 'text' + statement.id), expectedVersion: statement.draftVersion,
    }), 'Draft saved.')}>{errors => <Field title="Draft text" name={"text" + statement.id} errors={errors}>
      <textarea {...inputProps('text' + statement.id, errors)} defaultValue={statement.draft} maxLength={12000} rows={7} required />
    </Field>}</ActionForm>}
    {canAuthor && statement.draft && <details className="entry"><summary>Submit a new revision for review</summary>
      <ActionForm submit="Submit revision" onSubmit={form => onChange(() => api.submit(statement.id, {
        expectedVersion: statement.draftVersion, factVersionIds: form.getAll('facts').map(String),
        reviewers: policy.map(role => ({ role, userId: valueOf(form, role + statement.id) })),
      }), 'Immutable revision submitted.')}>{errors => <>
        <fieldset><legend>Cite verified, shareable facts</legend>
          {record.facts.filter(row => row.status === 'VERIFIED' && row.visibility === 'SHAREABLE').map(row => <label className="checkbox" key={row.id}>
            <input type="checkbox" name="facts" value={row.id} />{row.claim} (v{row.version})</label>)}
          {!record.facts.some(row => row.status === 'VERIFIED' && row.visibility === 'SHAREABLE') && <Notice>Verify and mark facts shareable before submission.</Notice>}
        </fieldset>
        {policy.map(role => <Owner key={role} name={role + statement.id} title={label(role)} errors={errors}
          members={record.members.filter(row => row.id !== statement.authorId && row.roles.includes(role))} />)}
      </>}</ActionForm>
    </details>}
    {current && <div className="record">
      <h3>Current revision {current.version}</h3><Badge value={current.state} /><pre className="statement-text">{current.text}</pre>
      <h4>Cited evidence</h4>
      {current.factVersionIds.map(id => { const fact = record.facts.find(row => row.id === id); return <p key={id}>{fact ? fact.claim + ' / v' + fact.version + ' / ' + label(fact.status) + ' / ' + label(fact.visibility) : 'Evidence unavailable'}</p> })}
      <h4>Named reviewers</h4>
      {current.reviewers.map(reviewer => <p key={reviewer.role}>{label(reviewer.role)} / {name(reviewer.userId)} / {
        label(current.decisions.find(row => row.userId === reviewer.userId)?.decision ?? 'PENDING')}</p>)}
      {current.decisions.map(decision => decision.comment && <p key={decision.userId}>{name(decision.userId)} — {decision.comment}</p>)}
      {current.state === 'IN_REVIEW' && record.status !== 'CLOSED' && current.reviewers.some(row => row.userId === accountId) &&
        <ActionForm submit="Record decision" onSubmit={form => onChange(() => api.decide(current.id, {
          decision: valueOf(form, 'decision' + statement.id) as contract.DecisionInput['decision'], comment: valueOf(form, 'comment' + statement.id),
        }), 'Review decision recorded.')}>{errors => <>
          <Field title="Decision" name={"decision" + statement.id} errors={errors}><select {...inputProps('decision' + statement.id, errors)}><option value="APPROVE">Approve</option><option value="REQUEST_CHANGES">Request changes</option></select></Field>
          <Field title="Review comment (required for changes)" name={"comment" + statement.id} errors={errors}><textarea {...inputProps('comment' + statement.id, errors)} maxLength={2000} /></Field>
        </>}</ActionForm>}
      {canAuthor && <button className="button" onClick={() => void onDownload(() => api.export(current.id), 'briefharbor-release-v' + current.version + '.txt')}>Export approved text</button>}
    </div>}
    <details className="entry"><summary>Revision history ({revisions.length})</summary>
      {revisions.map(row => <article className="record" key={row.id}><strong>Revision {row.version}</strong> <Badge value={row.state} />
        <p>{dateLabel(row.submittedAt)} / {name(row.authorId)}</p><pre className="statement-text">{row.text}</pre>
      </article>)}
    </details>
  </article>
}

function DeliveryForm({ record, workflow, change }: { record: contract.CaseDetail; workflow: contract.Workflow; change: Change }) {
  const storageKey = 'briefharbor.delivery.' + record.id
  return <details className="entry"><summary>Record an actual external delivery</summary>
    <p>Use the exact revision and actual send time from your external channel.</p>
    <ActionForm submit="Record delivery" onSubmit={async form => {
      const key = sessionStorage.getItem(storageKey) ?? crypto.randomUUID()
      sessionStorage.setItem(storageKey, key)
      await change(() => api.deliver(record.id, {
        revisionId: valueOf(form, 'revisionId'), channel: valueOf(form, 'channel') as contract.DeliveryInput['channel'],
        sentAt: utc(valueOf(form, 'sentAt')), ...(valueOf(form, 'deliveryInquiry') ? { inquiryId: valueOf(form, 'deliveryInquiry') } : { audience: valueOf(form, 'deliveryAudience') }),
      }, key), 'External delivery recorded.')
      sessionStorage.removeItem(storageKey)
    }}>{errors => <>
      <Field title="Previously exported revision" name="revisionId" errors={errors}><select {...inputProps('revisionId', errors)} required>
        <option value="">Choose a revision</option>{workflow.revisions.map(row => <option key={row.id} value={row.id}>{workflow.statements.find(item => item.id === row.statementId)?.audience} / v{row.version}</option>)}
      </select></Field>
      <Field title="Inquiry (optional)" name="deliveryInquiry" errors={errors}><select {...inputProps('deliveryInquiry', errors)}><option value="">Use audience below</option>{record.inquiries.filter(row => row.status === 'OPEN').map(row => <option key={row.id} value={row.id}>{row.outlet}</option>)}</select></Field>
      <Field title="Audience when no inquiry is selected" name="deliveryAudience" errors={errors}><input {...inputProps('deliveryAudience', errors)} maxLength={160} /></Field>
      <Field title="External channel" name="channel" errors={errors}><select {...inputProps('channel', errors)}>{['EMAIL', 'PHONE', 'PORTAL', 'OTHER'].map(value => <option key={value}>{value}</option>)}</select></Field>
      <Field title="Actual send time (local time)" name="sentAt" errors={errors}><input {...inputProps('sentAt', errors)} type="datetime-local" required /></Field>
    </>}</ActionForm>
  </details>
}

export function WorkflowPage({ caseId, statementId, report = false }: { caseId: string; statementId?: string; report?: boolean }) {
  const load = useCallback(() => api.detail(caseId), [caseId])
  const { data, error } = useLoad(load)
  return <><Link className="text-link back" href={caseHref(caseId)}>Back to case</Link>
    {error && <Notice error>{error}</Notice>}{!data && !error && <Notice>Loading case.</Notice>}
    {data && <><h1>{data.title}</h1><WorkflowPanel record={data} onChange={async () => { window.location.reload() }} selectedStatementId={statementId} initialView={report ? 'report' : 'statements'} /></>}
  </>
}




export function DemoWorkflowPage({ report = false }: { report?: boolean }) {
  const query = useSearchParams()
  return <WorkflowPage caseId={query.get('id') ?? demoCase.id} statementId={query.get('statementId') ?? undefined} report={report} />
}
