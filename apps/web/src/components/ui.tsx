'use client'

import Image from 'next/image'
import { useState, type FormEvent, type ReactNode } from 'react'
import { ApiError } from '../lib/api'
import { label, dateLabel } from '../lib/format'
import type { Person } from '@briefharbor/contracts'

export function Brand() {
  return <div className="brand"><Image src={(process.env.NEXT_PUBLIC_BRIEFHARBOR_BASE_PATH ?? '') + '/briefharbor-logo.png'} width={180} height={60} alt="BriefHarbor" priority /></div>
}
export function Badge({ value }: { value: string }) {
  return <span className={'badge ' + value.toLowerCase()}>{label(value)}</span>
}
export function Deadline({ value, active = true }: { value: string | null; active?: boolean }) {
  return value ? <span className="deadline"><time dateTime={value}>{dateLabel(value)}</time>
    {active && new Date(value).getTime() < Date.now() && <Badge value="OVERDUE" />}</span> : <span className="muted">None scheduled</span>
}
export function Notice({ children, error = false }: { children: ReactNode; error?: boolean }) {
  return <div className={error ? 'notice error' : 'notice'} role={error ? 'alert' : 'status'}>{children}</div>
}
export function Field({ title, name, errors, children }: { title: string; name: string; errors: Record<string, string>; children: ReactNode }) {
  return <div className="field"><label htmlFor={name}>{title}</label>{children}
    {errors[name] && <small className="field-error" id={name + '-error'}>{errors[name]}</small>}</div>
}
export function inputProps(name: string, errors: Record<string, string>) {
  return { id: name, name, 'aria-invalid': Boolean(errors[name]), 'aria-describedby': errors[name] ? name + '-error' : undefined }
}
export function Owner({ name = 'ownerId', title = 'Owner', members, errors, initial }: {
  name?: string; title?: string; members: Person[]; errors: Record<string, string>; initial?: string
}) {
  return <Field title={title} name={name} errors={errors}><select {...inputProps(name, errors)} defaultValue={initial ?? ''} required>
    <option value="" disabled>Choose a person</option>
    {members.map(member => <option key={member.id} value={member.id}>{member.name}</option>)}
  </select></Field>
}
export function ActionForm({ children, submit, onSubmit, className, pendingLabel = 'Saving…' }: {
  children: (errors: Record<string, string>) => ReactNode; submit: string;
  onSubmit: (data: FormData) => Promise<void>; className?: string; pendingLabel?: string
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [fields, setFields] = useState<Record<string, string>>({})
  async function handle(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return
    const form = event.currentTarget
    setBusy(true)
    setError('')
    setFields({})
    try { await onSubmit(new FormData(form)); form.reset() }
    catch (error) {
      setError(error instanceof Error ? error.message : 'The request failed.')
      if (error instanceof ApiError) setFields(error.fields)
    } finally { setBusy(false) }
  }
  return <form onSubmit={handle} className={className ?? 'form'} aria-busy={busy}>
    {error && <Notice error>{error}</Notice>}{children(fields)}
    <div><button className="button primary" disabled={busy}>{busy ? pendingLabel : submit}</button></div>
  </form>
}
export const valueOf = (form: FormData, key: string) => String(form.get(key) ?? '')

