import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ArrowRight, Clock3, FileCheck, FolderOpen, Radio } from 'lucide-react'
import { Brand } from '../components/ui'
import { caseHref, isDemo } from '../lib/demo-mode'
import { demoCase } from '../lib/fixture'

const steps = [
  { Icon: Clock3, title: 'Manage media inquiries', description: 'Review the reporter’s question, assignment, and response deadline.', action: 'Open media inquiries', href: caseHref(demoCase.id, 'inquiries') },
  { Icon: FileCheck, title: 'Verify incident facts', description: 'Switch to Fact owner, verify the portal restriction, and mark the fact shareable.', action: 'Open facts', href: caseHref(demoCase.id, 'facts') },
  { Icon: FolderOpen, title: 'Register a case', description: 'As Coordinator, log a case with its severity, owner, and next internal update.', action: 'Create a case', href: '/cases/new' },
]

export default function Home() {
  if (!isDemo) redirect('/dashboard')
  return <div className="demo-home">
    <header className="demo-home-nav">
      <Link className="demo-brand" href="/" aria-label="BriefHarbor home"><Brand /></Link>
      <nav aria-label="Demo navigation">
        <a className="text-link" href="#workflow">Workflow</a>
        <Link className="text-link" href="/cases">Cases</Link>
        <Link className="button primary" href="/dashboard">Dashboard <ArrowRight size={16} aria-hidden="true" /></Link>
      </nav>
    </header>
    <main>
      <section className="demo-hero" aria-labelledby="demo-title">
        <div className="demo-hero-copy">
          <h1 id="demo-title">Run your crisis response <em>from one workspace.</em></h1>
          <p>Track journalist deadlines, verify incident facts, and keep case owners aligned as the story develops.</p>
          <div className="demo-actions">
            <Link className="button primary" href="/dashboard">Open dashboard <ArrowRight size={17} aria-hidden="true" /></Link>
            <Link className="button" href={caseHref(demoCase.id)}>Explore sample case</Link>
          </div>
        </div>
        <aside className="demo-scenario" aria-labelledby="scenario-title">
          <div className="demo-scenario-top">
            <span><Radio size={17} aria-hidden="true" /> Sample case</span>
            <span className="badge high">High severity</span>
          </div>
          <div className="demo-scenario-body">
            <h2 id="scenario-title">Riverstone Retail</h2>
            <p>Customer portal access restriction</p>
            <ul>
              <li><span><Clock3 size={17} aria-hidden="true" /> Media deadline</span><span className="badge overdue">Overdue</span></li>
              <li><span><FileCheck size={17} aria-hidden="true" /> Incident fact</span><span className="badge unverified">Unverified</span></li>
            </ul>
            <Link className="text-link" href={caseHref(demoCase.id, 'inquiries')}>Review the reporter’s inquiry <ArrowRight size={16} aria-hidden="true" /></Link>
          </div>
        </aside>
      </section>
      <section className="demo-walkthrough" id="workflow" aria-labelledby="walkthrough-title">
        <h2 id="walkthrough-title">Explore the response workflow</h2>
        <ul>{steps.map(({ Icon, title, description, action, href }) => <li key={title}>
          <span className="icon-box"><Icon size={22} aria-hidden="true" /></span>
          <h3>{title}</h3><p>{description}</p>
          <Link className="text-link" href={href}>{action} <ArrowRight size={15} aria-hidden="true" /></Link>
        </li>)}</ul>
      </section>
    </main>
    <footer className="demo-home-footer">Fictional data. Changes stay in this browser. No sign-in required.</footer>
  </div>
}
