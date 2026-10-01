import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Navigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { SCHOOL_DOMAIN, isConfigured } from '../lib/supabase'
import { Splash } from '../components/RequireAuth'
import { Notice } from '../components/ui'

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

/** Only same-site paths are honoured, so ?next= can't bounce people off-site. */
function safeNext(raw: string | null) {
  return raw && raw.startsWith('/') && !raw.startsWith('//') && !raw.startsWith('/login') ? raw : null
}

const RESEND_SECONDS = 60

export default function Login() {
  const { session, profile, ready, authError, signInWithGoogle, sendEmailCode, verifyEmailCode } = useAuth()
  const [params, setParams] = useSearchParams()
  const door = params.get('as') === 'parent' ? 'parent' : 'student'
  const next = safeNext(params.get('next'))
  const [busy, setBusy] = useState(false)
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [sent, setSent] = useState(false)
  const [cooldown, setCooldown] = useState(0)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (cooldown <= 0) return
    const t = window.setTimeout(() => setCooldown((c) => c - 1), 1000)
    return () => window.clearTimeout(t)
  }, [cooldown])

  if (!ready) return <Splash label="Checking your sign-in" />
  if (session && profile) return <Navigate to={next ?? (profile.kind === 'parent' ? '/family' : '/')} replace />

  function switchDoor(d: 'student' | 'parent') {
    setError(null)
    const p: Record<string, string> = {}
    if (d === 'parent') p.as = 'parent'
    if (next) p.next = next
    setParams(p, { replace: true })
  }

  async function google() {
    setBusy(true)
    await signInWithGoogle('student', next ?? '/')
    setBusy(false)
  }

  async function send(e?: FormEvent) {
    e?.preventDefault()
    setError(null)
    if (email.trim().toLowerCase().endsWith(`@${SCHOOL_DOMAIN}`)) {
      return setError('That’s a school address. Use the Student & staff tab and sign in with Google.')
    }
    setBusy(true)
    const err = await sendEmailCode(email, next ?? '/family')
    setBusy(false)
    if (err) {
      setError(/rate|seconds|security purposes/i.test(err) ? 'Too many codes requested. Wait a minute and try again.' : err)
      return
    }
    setSent(true)
    setCode('')
    setCooldown(RESEND_SECONDS)
  }

  async function verify(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    const err = await verifyEmailCode(email, code)
    setBusy(false)
    if (err) setError(/expired|invalid/i.test(err) ? 'That code is wrong or has expired. Check the newest email, or send a new code.' : err)
  }

  const shownError = error ?? authError

  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.05fr_1fr]">
      {/* ---------- Poster: a band on phones, a full panel on desktop ---------- */}
      <div className="crimson-stage relative overflow-hidden px-6 pb-14 pt-8 sm:px-10 lg:flex lg:flex-col lg:justify-between lg:p-12">
        <img src="/crest.png" alt="" className="pointer-events-none absolute -bottom-24 -right-24 h-[115%] w-auto opacity-[0.08] lg:-bottom-16 lg:-right-20 lg:h-[85%]" aria-hidden />
        <div className="pointer-events-none absolute -left-10 bottom-0 top-0 hidden w-16 -skew-x-[10deg] lg:block" style={{ background: 'var(--gold)' }} aria-hidden />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1.5 lg:hidden" style={{ background: 'var(--gold)' }} aria-hidden />

        <div className="relative flex items-center gap-3 lg:pl-10">
          <img src="/crest.png" alt="GCS crest" className="h-12 w-auto drop-shadow-lg lg:h-16" />
          <div className="leading-none">
            <p className="display text-2xl lg:text-3xl">Athletics</p>
            <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.16em] text-[#f6efe2]/65">Gaonnuri Christian School</p>
          </div>
        </div>

        <div className="relative mt-10 lg:mt-0 lg:pl-10">
          <h1 className="display text-[clamp(3.2rem,12vw,4.5rem)] leading-[0.85] lg:text-[clamp(5rem,7vw,7.5rem)]">
            One school.
            <br />
            <span className="gold-text">Every game.</span>
          </h1>
          <ul className="mt-8 hidden max-w-md space-y-3 text-[15px] text-[#f6efe2]/80 lg:block">
            {[
              ['📅', 'Every game, tryout and sign-up deadline on one calendar'],
              ['✋', 'Sign up for tryouts and events in one tap'],
              ['🏅', 'Meet the athletes behind the jerseys'],
            ].map(([icon, text]) => (
              <li key={text} className="flex items-center gap-3">
                <span className="grid size-8 shrink-0 place-items-center rounded-full bg-black/20 text-sm" aria-hidden>
                  {icon}
                </span>
                {text}
              </li>
            ))}
          </ul>
        </div>

        <p className="relative hidden text-xs text-[#f6efe2]/55 lg:block lg:pl-10">For GCS students, staff and families.</p>
      </div>

      {/* ---------- The form ---------- */}
      <div className="relative -mt-6 flex justify-center rounded-t-[28px] bg-paper px-5 pb-16 pt-10 lg:mt-0 lg:items-center lg:rounded-none lg:py-16">
        <div className="rise w-full max-w-sm">
          <h2 className="display text-5xl">Sign in</h2>
          <p className="mt-2 text-sm muted">The GCS Athletics site is for our school community. Pick how you’re connected to GCS.</p>

          <div className="segmented mt-6 flex w-full" role="tablist" aria-label="Account type">
            {(['student', 'parent'] as const).map((d) => (
              <button key={d} type="button" role="tab" aria-selected={door === d} className="flex-1 !py-2" aria-pressed={door === d} onClick={() => switchDoor(d)}>
                {d === 'student' ? 'Student & staff' : 'Parent'}
              </button>
            ))}
          </div>

          {(!isConfigured || shownError) && (
            <div className="mt-5 space-y-3">
              {!isConfigured && <Notice tone="error">This site isn’t connected to its database yet. If you run the site, check the Supabase settings.</Notice>}
              {shownError && <Notice tone="error">{shownError}</Notice>}
            </div>
          )}

          {door === 'student' ? (
            <div className="mt-6">
              <button type="button" onClick={() => void google()} disabled={busy || !isConfigured} className="btn btn-ghost w-full py-3.5 text-base shadow-[var(--shadow)]">
                <GoogleMark />
                {busy ? 'Opening Google…' : 'Continue with Google'}
              </button>
              <p className="mt-4 text-center text-xs muted">
                Use your <b className="text-ink">@{SCHOOL_DOMAIN}</b> account.
              </p>
            </div>
          ) : !sent ? (
            <form onSubmit={(e) => void send(e)} className="mt-6 grid gap-3">
              <label className="field">
                <span className="label">Your email</span>
                <input
                  type="email"
                  required
                  autoComplete="email"
                  inputMode="email"
                  className="input py-3"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </label>
              <button type="submit" className="btn btn-primary py-3 text-base" disabled={busy || !isConfigured || !email.includes('@')}>
                {busy ? 'Sending…' : 'Email me a sign-in code'}
              </button>
              <p className="text-xs muted">
                Any email works — Gmail, Naver, Daum. No password needed. New here? This creates your account; then link it to your child with a family code they make on their GCS page.
              </p>
            </form>
          ) : (
            <form onSubmit={(e) => void verify(e)} className="mt-6 grid gap-3">
              <p className="text-sm muted">
                We sent a code to <b className="text-ink">{email}</b>. It can take a minute — check spam too.
              </p>
              <input
                inputMode="numeric"
                autoComplete="one-time-code"
                className="input num py-3 text-center text-3xl font-bold tracking-[0.35em]"
                placeholder="000000"
                maxLength={10}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                aria-label="Sign-in code"
                autoFocus
              />
              <button type="submit" className="btn btn-primary py-3 text-base" disabled={busy || code.length < 6}>
                {busy ? 'Checking…' : 'Sign in'}
              </button>
              <div className="flex items-center justify-between text-sm">
                <button type="button" className="font-semibold muted hover:text-ink" onClick={() => setSent(false)}>
                  ← Different email
                </button>
                <button type="button" className="font-semibold text-signal disabled:text-[var(--ink-3)]" disabled={cooldown > 0 || busy} onClick={() => void send()}>
                  {cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend code'}
                </button>
              </div>
            </form>
          )}

          <p className="mt-12 border-t hairline pt-5 text-xs faint">Trouble signing in? Ask a Student Council AD.</p>
        </div>
      </div>
    </div>
  )
}
