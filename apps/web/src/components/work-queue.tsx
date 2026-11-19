'use client'
import { useCallback } from 'react'
import Link from 'next/link'
import type { CaseSummary } from '@briefharbor/contracts'
import { api } from '../lib/api'
import { caseHref } from '../lib/demo-mode'
import { useLoad } from '../lib/use-load'
import { useSession } from './session'
import { Deadline, Notice } from './ui'

export function WorkQueue({ cases }: { cases: CaseSummary[] }) {
  const { account } = useSession()
  const load = useCallback(async () => Promise.all(cases.map(async item => ({ item, workflow: await api.workflow(item.id) }))), [cases])
  const { data, error } = useLoad(load)
  const tasks = data?.flatMap(({ item, workflow }) => workflow.tasks.filter(task => task.status === 'OPEN' && task.assigneeId === account?.id)
    .map(task => ({ item, task }))) ?? []
  const reviews = data?.flatMap(({ item, workflow }) => workflow.revisions.filter(revision => revision.state === 'IN_REVIEW' &&
    workflow.statements.some(statement => statement.currentRevisionId === revision.id) &&
    revision.reviewers.some(reviewer => reviewer.userId === account?.id) && !revision.decisions.some(decision => decision.userId === account?.id))
    .map(revision => ({ item, revision }))) ?? []
  return <section className="panel padded">
    <h2>My tasks and reviews</h2>
    {error && <Notice error>{error}</Notice>}
    {!data && !error && <Notice>Loading assigned work.</Notice>}
    {data && !tasks.length && !reviews.length && <p>No pending tasks or reviews.</p>}
    {tasks.map(({ item, task }) => <p key={task.id}><Link className="text-link" href={caseHref(item.id, 'workflow')}>{task.title}</Link> <Deadline value={task.deadlineAt} /></p>)}
    {reviews.map(({ item, revision }) => <p key={revision.id}><Link className="text-link" href={caseHref(item.id, 'workflow')}>Review {item.title} / revision {revision.version}</Link></p>)}
  </section>
}
