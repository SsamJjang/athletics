import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { Logo } from './Logo'

/** Full-screen brand mark while the session is being restored. */
export function Splash({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="grid min-h-dvh place-items-center bg-paper" role="status" aria-live="polite">
      <div className="flex flex-col items-center gap-5">
        <Logo />
        <span className="spinner" aria-hidden />
        <span className="sr-only">{label}</span>
      </div>
    </div>
  )
}

/**
 * The whole site is members-only. The database enforces it too (every read
 * policy is `to authenticated`); this just sends people to the door.
 */
export default function RequireAuth({ children }: { children: ReactNode }) {
  const { session, profile, ready, signOut } = useAuth()
  const location = useLocation()

  if (!ready) return <Splash />

  if (!session) {
    const next = location.pathname + location.search
    return <Navigate to={next === '/' ? '/login' : `/login?next=${encodeURIComponent(next)}`} replace />
  }

  // Signed in, but the account row couldn't be read — a network blip or a
  // deleted account. Never show a half-working site.
  if (!profile) {
    return (
      <div className="grid min-h-dvh place-items-center bg-paper px-6 text-center">
        <div className="max-w-sm">
          <Logo />
          <h1 className="display mt-8 text-4xl">We couldn’t load your account</h1>
          <p className="mt-3 text-sm muted">Check your connection and try again. If it keeps happening, sign out and back in.</p>
          <div className="mt-6 flex justify-center gap-2">
            <button type="button" className="btn btn-ink" onClick={() => window.location.reload()}>
              Try again
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => void signOut()}>
              Sign out
            </button>
          </div>
        </div>
      </div>
    )
  }

  return <>{children}</>
}
