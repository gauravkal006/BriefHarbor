'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { ArrowLeft, ArrowRight, Clock3, Eye, EyeOff, FileCheck, MessageSquare, ShieldCheck } from 'lucide-react'
import { demoProfile, login, registrationForm } from '@briefharbor/contracts'
import { api, ApiError } from '../lib/api'
import { isDemo } from '../lib/demo-mode'
import { useSession } from './session'
import { ActionForm, Brand, Field, inputProps, valueOf } from './ui'

const workflow = [
  { Icon: MessageSquare, title: 'Every inquiry has an owner', description: 'Keep the reporter, question, and response deadline together.' },
  { Icon: FileCheck, title: 'Every claim has a source', description: 'Build your response around facts your team has verified.' },
  { Icon: ShieldCheck, title: 'Every release has a review', description: 'Bring PR, legal, and client approvals into the same workflow.' },
]

export function AuthScreen({ mode }: { mode: 'login' | 'signup' }) {
  const signup = mode === 'signup'
  const router = useRouter()
  const { setAccount } = useSession()
  const [showPassword, setShowPassword] = useState(false)
  const title = signup ? 'Create your account' : 'Welcome back'
  const submit = isDemo ? signup ? 'Create demo profile' : 'Continue to demo' : signup ? 'Create account' : 'Sign in'
  const passwordHint = 'Use at least 15 characters. A memorable passphrase works well.'

  return <div className="auth-page">
    <header className="auth-header">
      <Link className="auth-brand" href={isDemo ? '/' : '/login'} aria-label="BriefHarbor home"><Brand /></Link>
      {isDemo && <Link className="auth-back" href="/"><ArrowLeft size={15} aria-hidden="true" />Back to demo</Link>}
    </header>
    <main className="auth-main">
      <section className="auth-story" aria-labelledby="auth-story-title">
        <div className="auth-story-content">
          <p className="auth-eyebrow">Crisis communications workspace</p>
          <h1 id="auth-story-title">A clear response starts with <span>the facts.</span></h1>
          <p className="auth-intro">Give your team a shared place to coordinate the response as the story develops.</p>
          <ul className="auth-workflow">
            {workflow.map(({ Icon, title, description }) => <li key={title}>
              <span className="auth-feature-icon"><Icon size={20} aria-hidden="true" /></span>
              <div><h2>{title}</h2><p>{description}</p></div>
            </li>)}
          </ul>
        </div>
        <div className="auth-story-note"><Clock3 size={17} aria-hidden="true" /><span>Stay aligned from the first inquiry to the approved response.</span></div>
      </section>
      <section className="auth-form-panel" aria-labelledby="auth-form-title">
        <div className="auth-form-content">
          <nav className="auth-tabs" aria-label="Account access">
            <Link href="/login" aria-current={!signup ? 'page' : undefined}>Sign in</Link>
            <Link href="/signup" aria-current={signup ? 'page' : undefined}>Sign up</Link>
          </nav>
          {isDemo && <p className="auth-demo-label"><span aria-hidden="true" />Interactive demo</p>}
          <h2 id="auth-form-title">{title}</h2>
          <p className="auth-description">{isDemo
            ? 'Personalize your visit. Your demo profile stays in this browser.'
            : signup ? "Join your team's crisis communications workspace." : 'Sign in to your cases, facts, and media deadlines.'}</p>

          <ActionForm key={mode} submit={submit} pendingLabel={signup ? 'Creating account…' : 'Signing in…'} className="form auth-form" onSubmit={async form => {
            const values = Object.fromEntries(form)
            const parsed = isDemo
              ? signup ? demoProfile.safeParse(values) : login.pick({ email: true }).safeParse(values)
              : signup ? registrationForm.safeParse(values) : login.safeParse(values)
            if (!parsed.success) throw new ApiError('Check the highlighted fields.', 422,
              Object.fromEntries(parsed.error.issues.map(issue => [String(issue.path[0]), issue.message])))
            const account = signup
              ? await api.signup({ name: valueOf(form, 'name'), email: valueOf(form, 'email'), password: valueOf(form, 'password') })
              : await api.login(valueOf(form, 'email'), valueOf(form, 'password'))
            setAccount(account)
            router.replace('/dashboard')
          }}>{errors => <>
            {signup && <Field title="Full name" name="name" errors={errors}>
              <input {...inputProps('name', errors)} autoComplete="name" placeholder="Your full name" maxLength={100} required />
            </Field>}
            <Field title={isDemo ? 'Email' : 'Work email'} name="email" errors={errors}>
              <input {...inputProps('email', errors)} type="email" autoComplete="username" autoCapitalize="none" spellCheck={false}
                placeholder={isDemo ? 'maya@example.test' : 'you@company.com'} maxLength={254} required />
            </Field>
            {!isDemo && <>
              <Field title="Password" name="password" errors={errors}>
                <div className="auth-password">
                  <input {...inputProps('password', errors)} type={showPassword ? 'text' : 'password'} maxLength={256}
                    minLength={signup ? 15 : 1} autoComplete={signup ? 'new-password' : 'current-password'} required
                    aria-describedby={['password' in errors ? 'password-error' : '', signup ? 'password-hint' : ''].filter(Boolean).join(' ') || undefined} />
                  <button type="button" className="auth-password-toggle" aria-label={showPassword ? 'Hide password' : 'Show password'}
                    aria-pressed={showPassword} aria-controls={signup ? 'password confirmPassword' : 'password'}
                    onClick={() => setShowPassword(value => !value)}>
                    {showPassword ? <EyeOff size={19} aria-hidden="true" /> : <Eye size={19} aria-hidden="true" />}
                  </button>
                </div>
                {signup && <small className="auth-hint" id="password-hint">{passwordHint}</small>}
              </Field>
              {signup && <Field title="Confirm password" name="confirmPassword" errors={errors}>
                <input {...inputProps('confirmPassword', errors)} type={showPassword ? 'text' : 'password'} autoComplete="new-password" maxLength={256} required />
              </Field>}
            </>}
          </>}</ActionForm>

          {isDemo ? <>
            <div className="auth-divider"><span>or explore the sample workspace</span></div>
            <Link className="button auth-guest" href="/dashboard">Explore as guest<ArrowRight size={16} aria-hidden="true" /></Link>
            <p className="auth-footnote">Fictional cases and simulated roles. Changes stay in this browser.</p>
          </> : <p className="auth-footnote">{signup
            ? 'Your coordinator assigns client and case access after you create an account.'
            : 'Need help signing in? Contact your workspace coordinator.'}</p>}
          <p className="auth-switch">{signup ? 'Already have an account?' : 'New to BriefHarbor?'}{' '}
            <Link href={signup ? '/login' : '/signup'}>{signup ? 'Sign in' : 'Create an account'}<ArrowRight size={14} aria-hidden="true" /></Link>
          </p>
        </div>
      </section>
    </main>
    <footer className="auth-footer">BriefHarbor<span>Crisis communications workspace</span></footer>
  </div>
}
