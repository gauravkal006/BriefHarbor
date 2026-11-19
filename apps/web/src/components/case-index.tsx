'use client'
import { WorkQueue } from './work-queue'
import { useCallback, useState } from 'react'
import Link from 'next/link'
import { Clock3, FolderOpen, Plus, TriangleAlert } from 'lucide-react'
import { caseStatus, caseType, severity, type CaseFilters, type Client } from '@briefharbor/contracts'
import { api } from '../lib/api'
import { caseHref } from '../lib/demo-mode'
import { label } from '../lib/format'
import { useLoad } from '../lib/use-load'
import { Badge, Deadline, Notice } from './ui'

export function CaseIndex({ dashboard = false }: { dashboard?: boolean }) {
  const { data: clients, error } = useLoad(api.clients)
  const [clientId, setClientId] = useState('')
  const client = clients?.find(item => item.id === clientId) ?? clients?.[0]
  return <>
    <div className="page-head"><div><h1>{dashboard ? 'Dashboard' : 'Cases'}</h1>
      <p>{dashboard ? 'Track assigned cases and media deadlines.' : 'Find and manage your assigned crisis cases.'}</p></div>
      {client?.roles.includes('COORDINATOR') && <Link className="button primary" href={'/cases/new?clientId=' + client.id}><Plus size={17} />New case</Link>}
    </div>
    {error && <Notice error>{error}</Notice>}
    {!clients && !error && <Notice>Loading clients…</Notice>}
    {clients?.length === 0 && <Notice>You have no active client memberships.</Notice>}
    {client && <><div className="client-bar"><div><label htmlFor="workspace-client">Client</label>
      <select id="workspace-client" value={client.id} onChange={event => setClientId(event.target.value)}>
        {clients?.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></div>
      {client.synthetic && <span className="synthetic">Synthetic data</span>}</div>
      <CaseList client={client} dashboard={dashboard} key={client.id} /></>}
  </>
}
function CaseList({ client, dashboard }: { client: Client; dashboard: boolean }) {
  const [status, setStatus] = useState<CaseFilters['status']>()
  const [level, setLevel] = useState<CaseFilters['severity']>()
  const [type, setType] = useState<CaseFilters['type']>()
  const load = useCallback(() => api.cases({ clientId: client.id, status, severity: level, type }), [client.id, status, level, type])
  const { data, error } = useLoad(load)
  const deadlines = (data ?? []).flatMap(item => item.nearestInquiryDeadlineAt ? [{ item, at: item.nearestInquiryDeadlineAt }] : [])
    .sort((a, b) => a.at.localeCompare(b.at))
  return <>
    {dashboard && data && <div className="metrics">
      {([{ Icon: FolderOpen, value: data.filter(item => item.status !== 'CLOSED').length, title: 'Open cases' },
        { Icon: Clock3, value: deadlines.length, title: 'Cases with media deadlines' },
        { Icon: TriangleAlert, value: deadlines.filter(item => Date.parse(item.at) < Date.now()).length, title: 'Cases with overdue inquiries' }]).map(({ Icon, value, title }) =>
        <div className="metric" key={title}><span className="icon-box"><Icon size={19} /></span><div><strong>{value}</strong><span>{title}</span></div></div>)}
    </div>}
    {dashboard && data && !client.roles.every(role => role === 'VIEWER') && <WorkQueue cases={data} />}
    {dashboard && deadlines[0] && <div className="deadline-panel"><div><strong>Nearest media deadline</strong>
      <Link href={caseHref(deadlines[0].item.id, 'inquiries')}>{deadlines[0].item.title}</Link></div><Deadline value={deadlines[0].at} /></div>}
    <section className="panel">
      <div className="panel-head"><h2>{dashboard ? 'Assigned cases' : 'Case register'}</h2>
        {dashboard && <Link className="text-link" href="/cases">View all cases</Link>}</div>
      {!dashboard && <div className="filters">
        <Filter title="Status" options={caseStatus.options} onChange={setStatus} />
        <Filter title="Severity" options={severity.options} onChange={setLevel} />
        <Filter title="Scenario" options={caseType.options} onChange={setType} />
      </div>}
      {error && <Notice error>{error}</Notice>}
      {!data && !error && <Notice>Loading cases…</Notice>}
      {data?.length === 0 && <Notice>No cases match this view.</Notice>}
      {data && data.length > 0 && <div className="table-scroll" tabIndex={0} aria-label="Case register"><table>
        <thead><tr><th scope="col">Case</th><th scope="col">Severity</th><th scope="col">Status</th><th scope="col">Media deadline</th></tr></thead>
        <tbody>{data.map(item => <tr key={item.id}>
          <td><Link className="case-link" href={caseHref(item.id)}>{item.title}</Link><span className="case-sub">{label(item.type)}</span></td>
          <td><Badge value={item.severity} /></td><td><Badge value={item.status} /></td><td><Deadline value={item.nearestInquiryDeadlineAt} /></td>
        </tr>)}</tbody>
      </table></div>}
    </section>
  </>
}
function Filter<T extends string>({ title, options, onChange }: { title: string; options: readonly T[]; onChange: (value: T | undefined) => void }) {
  const id = 'filter-' + title.toLowerCase()
  return <div><label htmlFor={id}>{title}</label><select id={id} onChange={event => onChange(options.find(value => value === event.target.value))}>
    <option value="">All</option>{options.map(value => <option key={value} value={value}>{label(value)}</option>)}</select></div>
}
