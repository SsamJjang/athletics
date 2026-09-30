import type { ReactNode } from 'react'
import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { Avatar } from './ui'
import { Logo } from './Logo'

const NAV = [
  { to: '/', label: 'Home', icon: 'M3 11 12 3l9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z', end: true },
  { to: '/calendar', label: 'Calendar', icon: 'M4 6h16v14H4zM4 10h16M9 3v4M15 3v4' },
  { to: '/sports', label: 'Sports', icon: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM3.5 9h17M3.5 15h17M12 3c-3 3-3 15 0 18M12 3c3 3 3 15 0 18' },
  { to: '/notices', label: 'Notices', icon: 'M4 5h16v11H8l-4 4zM8 9h8M8 12h5' },
  { to: '/athletes', label: 'Athletes', icon: 'M12 4a3.5 3.5 0 1 1 0 7 3.5 3.5 0 0 1 0-7zM5 20c.8-4 3.6-6 7-6s6.2 2 7 6' },
]

function NavIcon({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" className="size-[22px]" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinejoin="round" strokeLinecap="round" aria-hidden>
      <path d={d} />
    </svg>
  )
}

function useTheme() {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'))
  const toggle = () => {
    const next = !dark
    setDark(next)
    document.documentElement.classList.toggle('dark', next)
    try {
      localStorage.setItem('gcs-theme', next ? 'dark' : 'light')
    } catch {
      /* private mode — the toggle still works for this visit */
    }
  }
  return { dark, toggle }
}

function AccountMenu() {
  const { session, profile, access, signOut } = useAuth()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const location = useLocation()

  useEffect(() => setOpen(false), [location.pathname])
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  if (!session) {
    return (
      <Link to="/login" className="btn btn-ink btn-sm">
        Sign in
      </Link>
    )
  }

  const name = profile?.full_name || profile?.email || 'Account'
  const role = access.is_admin
    ? 'Admin'
    : profile?.kind === 'school'
      ? 'GCS'
      : access.is_verified_parent
        ? 'Parent · verified'
        : 'Parent · unverified'

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-full p-0.5 pr-1 transition hover:bg-surface-2"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <Avatar name={name} url={profile?.avatar_url} size={32} />
        {profile?.kind === 'parent' && !access.is_verified_parent && !access.is_admin && (
          <span className="size-2 rounded-full bg-signal" title="Not verified yet" />
        )}
      </button>
      {open && (
        <div className="card rise absolute right-0 top-11 z-40 w-64 overflow-hidden p-1.5" role="menu">
          <div className="px-3 py-2.5">
            <p className="truncate font-semibold">{name}</p>
            <p className="truncate text-xs muted">{profile?.email}</p>
            <span className="tag mt-2 bg-surface-2">{role}</span>
          </div>
          <div className="my-1 border-t hairline" />
          {profile?.kind === 'parent' ? (
            <MenuLink to="/family">My family</MenuLink>
          ) : (
            <MenuLink to="/me">My page</MenuLink>
          )}
          {access.is_admin && <MenuLink to="/admin">Admin</MenuLink>}
          <button
            type="button"
            role="menuitem"
            onClick={() => void signOut()}
            className="w-full rounded-lg px-3 py-2 text-left text-sm font-medium muted hover:bg-surface-2"
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  )
}

function MenuLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link to={to} role="menuitem" className="block rounded-lg px-3 py-2 text-sm font-medium hover:bg-surface-2">
      {children}
    </Link>
  )
}

export default function Layout() {
  const { access } = useAuth()
  const { dark, toggle } = useTheme()
  const location = useLocation()

  useEffect(() => {
    window.scrollTo({ top: 0 })
  }, [location.pathname])

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-30 border-b hairline bg-paper/85 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-6 px-4 sm:px-6">
          <Link to="/" className="shrink-0" aria-label="GCS Athletics home">
            <Logo />
          </Link>
          <nav className="hidden items-center gap-6 md:flex" aria-label="Main">
            {NAV.map((n) => (
              <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                {n.label}
              </NavLink>
            ))}
            {access.is_admin && (
              <NavLink to="/admin" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                <span className="tag bg-volt text-[#131311]">Admin</span>
              </NavLink>
            )}
          </nav>
          <div className="ml-auto flex items-center gap-1.5">
            <button type="button" className="icon-btn" onClick={toggle} aria-label={dark ? 'Light mode' : 'Dark mode'}>
              {dark ? (
                <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                  <circle cx="12" cy="12" r="4" />
                  <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" strokeLinecap="round" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                  <path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z" strokeLinejoin="round" />
                </svg>
              )}
            </button>
            <AccountMenu />
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 pb-28 pt-8 sm:px-6 md:pb-16">
        <Outlet />
      </main>

      <footer className="hidden border-t hairline md:block">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-6 py-8 text-sm muted">
          <div className="flex items-center gap-3">
            <Logo compact />
            <span>Gaonnuri Christian School · Songdo</span>
          </div>
          <span className="faint">Run by the Student Council Athletic Directors</span>
        </div>
      </footer>

      {/* Phone tab bar — thumbs live at the bottom. */}
      <nav
        className="fixed inset-x-0 bottom-0 z-30 border-t hairline bg-paper/92 pb-[env(safe-area-inset-bottom)] backdrop-blur-md md:hidden"
        aria-label="Main"
      >
        <div className="grid grid-cols-5">
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              className={({ isActive }) =>
                `flex flex-col items-center gap-0.5 py-2.5 text-[10.5px] font-semibold ${isActive ? 'text-signal' : 'muted'}`
              }
            >
              <NavIcon d={n.icon} />
              {n.label}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  )
}
