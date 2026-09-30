import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link, Navigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { SCHOOL_DOMAIN, isConfigured } from '../lib/supabase'
import { Logo } from '../components/Logo'
import { Notice, Spinner } from '../components/ui'

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" className="size-5" aria-hidden>
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.76h3.57c2.08-1.92 3.28-4.74 3.28-8.09Z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.76c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z" />
      <path fill="#FBBC05" d="M5.84 14.11a6.6 6.6 0 0 1 0-4.22V7.05H2.18a11 11 0 0 0 0 9.9l3.66-2.84Z" />
      <path fill="#EA4335" d="M12 4.75c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 1.46 14.97.5 12 .5a11 11 0 0 0-9.82 6.05l3.66 2.84c.87-2.6 3.3-4.64 6.16-4.64Z" />
    </svg>
  )
}

export default function Login() {
  const { session, profile, loading, authError, signInWithGoogle, sendEmailCode, verifyEmailCode } = useAuth()
  const [params, setParams] = useSearchParams()
  const door = params.get('as') === 'parent' ? 'parent' : 'student'
  const [busy, setBusy] = useState(false)
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (loading) return <Spinner label="Checking your sign-in" />
  if (session && profile) return <Navigate to={profile.kind === 'parent' ? '/family' : '/'} replace />

  async function google() {
    setBusy(true)
    await signInWithGoogle(door)
    setBusy(false)
  }

  async function send(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (email.trim().toLowerCase().endsWith(`@${SCHOOL_DOMAIN}`)) {
      return setError('That’s a school address — use the Student tab and sign in with Google.')
    }
    setBusy(true)
    const err = await sendEmailCode(email)
    setBusy(false)
    if (err) setError(/rate|seconds/i.test(err) ? 'Too many codes requested. Wait a minute and try again.' : err)
    else setSent(true)
  }

  async function verify(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    const err = await verifyEmailCode(email, code)
    setBusy(false)
    if (err) setError(/expired|invalid/i.test(err) ? 'That code is wrong or expired. Check the latest email, or send a new one.' : err)
  }

  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.1fr_1fr]">
      {/* ---------- Left: the poster ---------- */}
      <div className="stage relative hidden overflow-hidden bg-ink p-12 text-paper lg:flex lg:flex-col lg:justify-between">
        <div className="pointer-events-none absolute inset-0 opacity-[0.07]" style={{ backgroundImage: 'repeating-linear-gradient(0deg, #fff 0 1px, transparent 1px 64px)' }} aria-hidden />
        <div className="pointer-events-none absolute -bottom-20 -left-10 h-[140%] w-40 rotate-[20deg] bg-signal" aria-hidden />
        <div className="pointer-events-none absolute -bottom-20 left-36 h-[140%] w-8 rotate-[20deg] bg-volt" aria-hidden />

        <Link to="/" className="relative w-fit rounded-md bg-paper p-2 text-ink">
          <Logo />
        </Link>
        <div className="relative ml-auto max-w-lg text-right">
          <p className="display text-[7.5rem] leading-[0.82]">
            One
            <br />
            school.
            <br />
            <span className="text-volt">Every</span>
            <br />
            game.
          </p>
        </div>
        <p className="relative ml-auto max-w-sm text-right text-sm text-paper/60">
          Gaonnuri Christian School Athletics — games, tryouts and deadlines for students and families.
        </p>
      </div>

      {/* ---------- Right: the door ---------- */}
      <div className="flex items-center justify-center px-5 py-14">
        <div className="rise w-full max-w-sm">
          <Link to="/" className="mb-10 inline-block lg:hidden">
            <Logo />
          </Link>
          <h1 className="display text-5xl">Sign in</h1>

          <div className="segmented mt-6 w-full">
            {(['student', 'parent'] as const).map((d) => (
              <button
                key={d}
                type="button"
                className="flex-1"
                aria-pressed={door === d}
                onClick={() => {
                  setError(null)
                  setParams(d === 'parent' ? { as: 'parent' } : {}, { replace: true })
                }}
              >
                {d === 'student' ? 'Student & staff' : 'Parent'}
              </button>
            ))}
          </div>

          <div className="mt-6 space-y-4">
            {!isConfigured && (
              <Notice tone="error">
                Supabase isn’t configured. Copy <code>.env.example</code> to <code>.env</code> and add the project URL and anon key.
              </Notice>
            )}
            {(authError || error) && <Notice tone="error">{error ?? authError}</Notice>}
          </div>

          {door === 'student' ? (
            <div className="mt-6">
              <p className="text-sm muted">
                Use your <b className="text-ink">@{SCHOOL_DOMAIN}</b> Google account. No roster needed — every GCS account works.
              </p>
              <button type="button" onClick={() => void google()} disabled={busy || !isConfigured} className="btn btn-ghost mt-6 w-full py-3 text-base">
                <GoogleMark />
                {busy ? 'Opening Google…' : 'Continue with school Google'}
              </button>
            </div>
          ) : (
            <div className="mt-6">
              <ol className="mb-6 space-y-2 text-sm">
                {['Sign in with any email address — we’ll email you a code.', 'Ask your child for a family code — they make one on their GCS account page.', 'Enter the family code. You’re verified.'].map((t, i) => (
                  <li key={i} className="flex gap-3">
                    <span className="grid size-6 shrink-0 place-items-center rounded-full bg-ink text-[11px] font-bold text-paper">{i + 1}</span>
                    <span className="muted">{t}</span>
                  </li>
                ))}
              </ol>

              {/* No Google button here: the Google sign-in app is Internal to
                  the school's Workspace, so personal accounts can't use it. */}

              {!sent ? (
                <form onSubmit={(e) => void send(e)} className="grid gap-3">
                  <input
                    type="email"
                    required
                    autoComplete="email"
                    className="input"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                  <button type="submit" className="btn btn-ink" disabled={busy || !isConfigured}>
                    {busy ? 'Sending…' : 'Email me a sign-in code'}
                  </button>
                </form>
              ) : (
                <form onSubmit={(e) => void verify(e)} className="grid gap-3">
                  <p className="text-sm muted">
                    We sent a code to <b className="text-ink">{email}</b>. It can take a minute — check spam too.
                  </p>
                  <input
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    className="input num text-center text-2xl font-bold tracking-[0.4em]"
                    placeholder="••••••"
                    maxLength={10}
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                    autoFocus
                  />
                  <button type="submit" className="btn btn-ink" disabled={busy || code.length < 6}>
                    {busy ? 'Checking…' : 'Sign in'}
                  </button>
                  <button type="button" className="btn btn-quiet btn-sm" onClick={() => setSent(false)}>
                    Use a different email
                  </button>
                </form>
              )}
            </div>
          )}

          <p className="mt-10 text-center text-sm">
            <Link to="/" className="font-semibold muted hover:text-ink">
              ← Browse without signing in
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
