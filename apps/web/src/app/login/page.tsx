'use client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { isDemo } from '../../lib/demo-mode'
import { api } from '../../lib/api'
import { useSession } from '../../components/session'
import { ActionForm, Brand, Field, inputProps, valueOf } from '../../components/ui'

export default function Login() {
  const router = useRouter()
  const { setAccount } = useSession()
  if (isDemo) return <main className="login-page"><div className="login-panel"><Brand /><h1>Explore BriefHarbor</h1><Link className="button primary" href="/dashboard">Open demo dashboard</Link></div></main>
  return <main className="login-page"><div className="login-panel">
    <Brand /><h1>Sign in to BriefHarbor</h1><p>Access your client cases, facts, and media deadlines.</p>
    <ActionForm submit="Sign in" onSubmit={async form => {
      setAccount(await api.login(valueOf(form, 'email'), valueOf(form, 'password')))
      router.replace('/dashboard')
    }}>{errors => <>
      <Field title="Work email" name="email" errors={errors}><input {...inputProps('email', errors)} type="email" autoComplete="username" required /></Field>
      <Field title="Password" name="password" errors={errors}><input {...inputProps('password', errors)} type="password" autoComplete="current-password" required /></Field>
    </>}</ActionForm>
  </div></main>
}
