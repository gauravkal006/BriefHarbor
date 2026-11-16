import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ArrowRight, Clock3, FileCheck, FolderOpen } from 'lucide-react'
import { Brand } from '../components/ui'
import { caseHref, isDemo } from '../lib/demo-mode'
import { demoCase } from '../lib/fixture'

const steps = [
  { Icon: Clock3, title: 'Triage a media deadline', description: 'Open the overdue Ledger Desk inquiry and review the reporter’s question, owner, and deadline.' },
  { Icon: FileCheck, title: 'Verify the incident facts', description: 'Switch to Fact owner, verify the portal restriction, and mark it shareable. The scope of the incident is still unknown.' },
  { Icon: FolderOpen, title: 'Create a new case', description: 'Switch back to Coordinator and log a case with its severity, owner, and next internal update.' },
]

export default function Home() {
  if (!isDemo) redirect('/dashboard')
  return <main className="demo-home">
    <header className="demo-home-nav"><Brand /><Link className="text-link" href="/dashboard">Dashboard <ArrowRight size={16} /></Link></header>
    <section className="demo-hero">
      <div className="demo-hero-copy">
        <span className="synthetic">Interactive frontend demo</span>
        <h1>Manage a crisis from the first media inquiry.</h1>
        <p>BriefHarbor brings case ownership, verified facts, and journalist deadlines into one workspace for crisis communications teams.</p>
        <div className="demo-actions">
          <Link className="button primary" href="/dashboard">Open dashboard <ArrowRight size={17} /></Link>
          <Link className="button" href={caseHref(demoCase.id, 'inquiries')}>Open the sample case</Link>
        </div>
      </div>
      <aside className="demo-scenario">
        <div className="status-line"><span className="badge high">High severity</span><span className="badge overdue">Media deadline overdue</span></div>
        <h2>Riverstone Retail</h2>
        <p>Riverstone has restricted access to its customer portal. A reporter wants to know whether customer records were affected while the security team is still investigating.</p>
      </aside>
    </section>
    <section className="demo-walkthrough" aria-labelledby="walkthrough-title">
      <h2 id="walkthrough-title">Try the workflow</h2>
      <ol>{steps.map(({ Icon, title, description }) => <li key={title}>
        <span className="icon-box"><Icon size={20} aria-hidden="true" /></span>
        <div><h3>{title}</h3><p>{description}</p></div>
      </li>)}</ol>
    </section>
    <footer className="demo-home-footer">Fictional data. Changes stay in this browser. No sign-in required.</footer>
  </main>
}
