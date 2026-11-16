'use client'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { FolderClosed, LayoutDashboard, LogOut, Menu } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { api } from '../lib/api'
import { resetDemo, setDemoRole } from '../lib/demo-api'
import { isDemo } from '../lib/demo-mode'
import { Brand, Notice } from './ui'
import { useSession } from './session'

export function Shell({ children }: { children: ReactNode }) {
  const path = usePathname()
  const router = useRouter()
  const { account, error, loading, refresh, setAccount } = useSession()
  const [menu, setMenu] = useState(false)
  const [logoutError, setLogoutError] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => { if (!loading && !account && !error) router.replace('/login') }, [loading, account, error, router])
  if (loading) return <main className="standalone"><Notice>Loading workspace…</Notice></main>
  if (error) return <main className="standalone"><Notice error>{error}</Notice><button className="button" onClick={() => void refresh()}>Retry</button></main>
  if (!account) return <main className="standalone"><Notice>Opening sign-in…</Notice></main>
  async function logout() {
    setBusy(true)
    setLogoutError('')
    try { await api.logout(); setAccount(null); router.replace('/login') }
    catch (error) { setLogoutError(error instanceof Error ? error.message : 'Could not sign out.') }
    finally { setBusy(false) }
  }
  const links = [{ href: '/dashboard', title: 'Dashboard', Icon: LayoutDashboard }, { href: '/cases', title: 'Cases', Icon: FolderClosed }]
  return <div className="shell">
    <a className="skip" href="#main-content">Skip to content</a>
    <aside className="sidebar">
      <div className="brand-row"><Link href="/dashboard" onClick={() => setMenu(false)}><Brand /></Link>
        <button className="button menu-toggle" aria-label="Toggle navigation" aria-expanded={menu} aria-controls="workspace-nav"
          onClick={() => setMenu(!menu)}><Menu size={19} /></button></div>
      <div id="workspace-nav" className={menu ? 'sidebar-body open' : 'sidebar-body'}>
        <nav aria-label="Workspace navigation">{links.map(({ href, title, Icon }) => <Link key={href} href={href}
          aria-current={path === href || path.startsWith(href + '/') ? 'page' : undefined} onClick={() => setMenu(false)}><Icon size={18} />{title}</Link>)}</nav>
        <div className="sidebar-footer"><strong>{account.name}</strong>
          {isDemo ? <Link className="button signout" href="/">Demo walkthrough</Link> : <button className="button signout" disabled={busy} onClick={() => void logout()}><LogOut size={16} />{busy ? 'Signing out…' : 'Sign out'}</button>}
          {logoutError && <Notice error>{logoutError}</Notice>}
        </div>
      </div>
    </aside>
    <div className="stage"><header className="topbar">
      {isDemo ? <div className="demo-toolbar">
        <span>Frontend demo · Fictional data</span>
        <div className="demo-controls">
          <label htmlFor="demo-role">Demo role</label>
          <select id="demo-role" value={account.email.startsWith('facts@') ? 'analyst' : 'coordinator'}
            onChange={event => {
              setDemoRole(event.target.value === 'analyst' ? 'analyst' : 'coordinator')
              void refresh()
            }}>
            <option value="coordinator">Coordinator</option><option value="analyst">Fact owner</option>
          </select>
          <button className="button" onClick={() => {
            resetDemo()
            window.location.assign((process.env.NEXT_PUBLIC_BRIEFHARBOR_BASE_PATH ?? '') + '/dashboard/')
          }}>Reset demo</button>
        </div>
      </div> : 'Crisis communications workspace'}
    </header><main id="main-content" className="content">{children}</main></div>
  </div>
}
