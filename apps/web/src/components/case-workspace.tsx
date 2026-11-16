'use client'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import type { CaseDetail, FactInput, Inquiry } from '@briefharbor/contracts'
import { api } from '../lib/api'
import { dateField, dateLabel, label, utc } from '../lib/format'
import { useLoad } from '../lib/use-load'
import { useSession } from './session'
import { ActionForm, Badge, Deadline, Field, inputProps, Notice, Owner, valueOf } from './ui'

const views = [['overview', 'Overview'], ['facts', 'Facts'], ['inquiries', 'Media Inquiries']] as const
export function CaseWorkspace({ caseId }: { caseId: string }) {
  const [data, setData] = useState<CaseDetail | null>(null)
  const load = useCallback(() => api.detail(caseId), [caseId])
  const { data: initial, error } = useLoad(load)
  const [view, setView] = useState('overview')
  const [saved, setSaved] = useState('')
  const { account } = useSession()
  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get('view')
    if (requested && views.some(item => item[0] === requested)) setView(requested)
  }, [])
  const current = data ?? initial
  async function update(action: () => Promise<unknown>, message: string) {
    setSaved('')
    await action()
    setSaved(message)
    try { setData(await load()) }
    catch { setSaved(message + ' Reload this page to see the update.') }
  }
  const canWrite = current?.roles.includes('COORDINATOR') && current.status !== 'CLOSED'
  const memberName = (id: string | null) => current?.members.find(member => member.id === id)?.name ?? 'Former member'
  return <>
    <Link className="text-link back" href="/cases"><ArrowLeft size={16} />Cases</Link>
    {error && <Notice error>{error}</Notice>}
    {!current && !error && <Notice>Loading case…</Notice>}
    {current && <>
      <div className="page-head"><div><div className="status-line"><Badge value={current.severity} /><Badge value={current.status} />
        {current.synthetic && <span className="synthetic">Synthetic data</span>}</div><h1>{current.title}</h1><p>{label(current.type)}</p></div></div>
      <nav className="tabs" aria-label="Case sections">{views.map(([key, title]) =>
        <button key={key} aria-current={view === key ? 'page' : undefined} onClick={() => {
          setView(key)
          setSaved('')
          const url = new URL(window.location.href)
          url.searchParams.set('view', key)
          window.history.replaceState(null, '', url)
        }}>{title}</button>)}</nav>
      {saved && <Notice>{saved}</Notice>}
      {view === 'overview' && <section className="panel padded">
        <h2>Overview</h2><dl className="overview-grid">
          <div><dt>Case owner</dt><dd>{memberName(current.ownerId)}</dd></div>
          <div><dt>Next internal update</dt><dd><Deadline value={current.nextUpdateAt} active={current.status !== 'CLOSED'} /></dd></div>
          <div><dt>Nearest media deadline</dt><dd><Deadline value={current.nearestInquiryDeadlineAt} /></dd></div>
          <div><dt>Verified facts</dt><dd>{current.facts.filter(fact => fact.status === 'VERIFIED').length} of {current.facts.length}</dd></div>
        </dl>
      </section>}
      {view === 'facts' && <section className="panel padded">
        <h2>Facts</h2>
        {!current.facts.length && <Notice>No facts have been recorded.</Notice>}
        {current.facts.map(fact => <article className="record" key={fact.id}>
          <div className="status-line"><Badge value={fact.status} /><Badge value={fact.visibility} /></div>
          <h3>{fact.claim}</h3><p>Source · {fact.source}</p><p>Fact owner · {memberName(fact.ownerId)}</p>
          {fact.verifiedAt && <p>Verified by {memberName(fact.verifierId)} · {dateLabel(fact.verifiedAt)}</p>}
          {fact.status === 'UNVERIFIED' && account?.id === fact.ownerId && current.roles.includes('FACT_OWNER') && current.status !== 'CLOSED' &&
            <ActionForm submit="Verify fact" onSubmit={form => update(() => api.verify(caseId, fact.id, form.has('share')), 'Fact verified.')}>
              {() => <label className="checkbox"><input name="share" type="checkbox" defaultChecked={fact.visibility === 'SHAREABLE'} /> Mark shareable</label>}
            </ActionForm>}
        </article>)}
        {canWrite ? <details className="entry"><summary>Add fact</summary><ActionForm submit="Save fact" onSubmit={form =>
          update(() => api.addFact(caseId, {
            claim: valueOf(form, 'claim'), source: valueOf(form, 'source'), ownerId: valueOf(form, 'ownerId'),
            visibility: valueOf(form, 'visibility') as FactInput['visibility'],
          }), 'Fact added.')}>{errors => <>
            <Field title="Claim" name="claim" errors={errors}><textarea {...inputProps('claim', errors)} required maxLength={2000} /></Field>
            <Field title="Source reference" name="source" errors={errors}><input {...inputProps('source', errors)} required maxLength={500} /></Field>
            <Owner title="Fact owner" members={current.factOwnerOptions} errors={errors} />
            <Field title="Visibility" name="visibility" errors={errors}><select {...inputProps('visibility', errors)}><option value="INTERNAL">Internal</option><option value="SHAREABLE">Shareable</option></select></Field>
          </>}</ActionForm></details> : <p>An assigned coordinator can add facts to an open case.</p>}
      </section>}
      {view === 'inquiries' && <section className="panel padded">
        <h2>Media Inquiries</h2>
        {!current.inquiries.length && <Notice>No media inquiries have been recorded.</Notice>}
        {current.inquiries.map(inquiry => <article className="record" key={inquiry.id}>
          <div className="record-head"><h3>{inquiry.outlet}</h3><Badge value={inquiry.status} /></div>
          <p>{inquiry.contact}</p><p className="question">{inquiry.question}</p><p>Owner · {memberName(inquiry.ownerId)}</p>
          <p>Deadline · <Deadline value={inquiry.deadlineAt} active={inquiry.status === 'OPEN'} /></p>
          {inquiry.closureReason && <p>Closure reason · {inquiry.closureReason}</p>}
          {canWrite && inquiry.status === 'OPEN' && <details className="entry"><summary>Edit inquiry</summary>
            <InquiryForm key={inquiry.deadlineAt + inquiry.ownerId} inquiry={inquiry} members={current.members} onSave={form => {
              const reason = valueOf(form, 'closureReason' + inquiry.id).trim()
              return update(() => api.editInquiry(caseId, inquiry.id, {
                ownerId: valueOf(form, 'ownerId' + inquiry.id), deadlineAt: utc(valueOf(form, 'deadlineAt' + inquiry.id)),
                ...(reason ? { status: 'CLOSED_WITHOUT_RESPONSE', closureReason: reason } : {}),
              }), 'Inquiry updated.')
            }} /></details>}
        </article>)}
        {canWrite ? <details className="entry"><summary>Add inquiry</summary><InquiryForm members={current.members} onSave={form =>
          update(() => api.addInquiry(caseId, {
            outlet: valueOf(form, 'outlet'), contact: valueOf(form, 'contact'), question: valueOf(form, 'question'),
            ownerId: valueOf(form, 'ownerId'), deadlineAt: utc(valueOf(form, 'deadlineAt')),
          }), 'Inquiry added.')} /></details> : <p>An assigned coordinator can manage inquiries on an open case.</p>}
      </section>}
    </>}
  </>
}
function InquiryForm({ inquiry, members, onSave }: { inquiry?: Inquiry; members: CaseDetail['members']; onSave: (data: FormData) => Promise<void> }) {
  const suffix = inquiry?.id ?? ''
  const owner = 'ownerId' + suffix
  const deadline = 'deadlineAt' + suffix
  const closure = 'closureReason' + suffix
  const eligible = members.filter(member => member.roles.some(role => role === 'COORDINATOR' || role === 'PR_LEAD'))
  return <ActionForm submit={inquiry ? 'Save changes' : 'Save inquiry'} onSubmit={onSave}>{errors => {
    const fields = { ...errors, [owner]: errors.ownerId, [deadline]: errors.deadlineAt, [closure]: errors.closureReason }
    return <>
      {!inquiry && <>
        <div className="form-row">
          <Field title="Outlet" name="outlet" errors={fields}><input {...inputProps('outlet', fields)} required maxLength={160} /></Field>
          <Field title="Contact" name="contact" errors={fields}><input {...inputProps('contact', fields)} required maxLength={254} /></Field>
        </div>
        <Field title="Question" name="question" errors={fields}><textarea {...inputProps('question', fields)} required maxLength={2000} /></Field>
      </>}
      <div className="form-row"><Owner name={owner} members={eligible} errors={fields} initial={inquiry?.ownerId} />
        <Field title="Deadline (local time)" name={deadline} errors={fields}>
          <input {...inputProps(deadline, fields)} type="datetime-local" defaultValue={dateField(inquiry?.deadlineAt)} required /></Field></div>
      {inquiry && <Field title="Reason to close without response (optional)" name={closure} errors={fields}>
        <input {...inputProps(closure, fields)} maxLength={500} /></Field>}
    </>
  }}</ActionForm>
}

export function DemoCaseWorkspace() {
  const caseId = useSearchParams().get('id')
  if (!caseId) return <Notice error>Choose a case from the case register.</Notice>
  return <CaseWorkspace key={caseId} caseId={caseId} />
}
