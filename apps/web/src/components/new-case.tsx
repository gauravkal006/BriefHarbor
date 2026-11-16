'use client'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { ArrowLeft } from 'lucide-react'
import { caseInput, caseType, severity } from '@briefharbor/contracts'
import { api, ApiError } from '../lib/api'
import { caseHref } from '../lib/demo-mode'
import { label, utc } from '../lib/format'
import { useLoad } from '../lib/use-load'
import { ActionForm, Field, inputProps, Notice, Owner, valueOf } from './ui'

export function NewCase() {
  const router = useRouter()
  const { data, error } = useLoad(api.clients)
  const clients = data?.filter(client => client.roles.includes('COORDINATOR'))
  const [clientId, setClientId] = useState('')
  useEffect(() => { setClientId(new URLSearchParams(window.location.search).get('clientId') ?? '') }, [])
  const client = clients?.find(item => item.id === clientId) ?? clients?.[0]
  return <>
    <Link className="text-link back" href="/cases"><ArrowLeft size={16} />Cases</Link>
    <div className="page-head"><div><h1>New case</h1><p>Set the case owner and the next internal update.</p></div></div>
    {error && <Notice error>{error}</Notice>}
    {!data && !error && <Notice>Loading eligible clients…</Notice>}
    {clients?.length === 0 && <Notice error>A coordinator membership is required to create a case.</Notice>}
    {client && <section className="panel form-panel">
      <ActionForm submit="Create case" onSubmit={async form => {
        const parsed = caseInput.safeParse({ ...Object.fromEntries(form), nextUpdateAt: utc(valueOf(form, 'nextUpdateAt')) })
        if (!parsed.success) throw new ApiError('Check the highlighted fields.', 422, Object.fromEntries(parsed.error.issues.map(issue => [String(issue.path[0]), issue.message])))
        const created = await api.create(parsed.data)
        router.push(caseHref(created.id))
      }}>{errors => <>
        <Field title="Client" name="clientId" errors={errors}><select {...inputProps('clientId', errors)} value={client.id} onChange={event => setClientId(event.target.value)}>
          {clients?.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
        <Field title="Case title" name="title" errors={errors}><input {...inputProps('title', errors)} maxLength={160} required /></Field>
        <div className="form-row">
          <Field title="Scenario" name="type" errors={errors}><select {...inputProps('type', errors)}>{caseType.options.map(type => <option key={type} value={type}>{label(type)}</option>)}</select></Field>
          <Field title="Severity" name="severity" errors={errors}><select {...inputProps('severity', errors)} defaultValue="MEDIUM">{severity.options.map(item => <option key={item} value={item}>{label(item)}</option>)}</select></Field>
        </div>
        <div className="form-row"><Owner key={client.id} members={client.members.filter(member => member.roles.some(role => role === 'COORDINATOR' || role === 'PR_LEAD'))} errors={errors} />
          <Field title="Next update (local time)" name="nextUpdateAt" errors={errors}><input {...inputProps('nextUpdateAt', errors)} type="datetime-local" required /></Field></div>
      </>}</ActionForm>
    </section>}
  </>
}
