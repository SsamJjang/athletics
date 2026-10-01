import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { renderMarkdown } from '../lib/markdown'
import { kindOf, seasonOf } from '../lib/meta'
import type { EventKind, Season, Sport } from '../lib/types'

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-20 muted" role="status">
      <span className="spinner" aria-hidden />
      {label && <span className="text-sm">{label}</span>}
    </div>
  )
}

export function Notice({ tone = 'info', children }: { tone?: 'info' | 'error' | 'success'; children: ReactNode }) {
  const styles = {
    info: 'border-line bg-surface-2/60',
    error: 'border-[#d0342c]/30 bg-[#d0342c]/8 text-[#b42a23] dark:text-[#ff8a80]',
    success: 'border-[#2a9a55]/30 bg-[#2a9a55]/10 text-[#1f7a42] dark:text-[#7ddc9f]',
  }[tone]
  return <div className={`rounded-xl border px-4 py-3 text-sm ${styles}`}>{children}</div>
}

export function EmptyState({
  icon,
  title,
  children,
  action,
}: {
  icon?: string
  title: string
  children?: ReactNode
  action?: ReactNode
}) {
  return (
    <div className="card lanes flex flex-col items-center px-6 py-14 text-center">
      {icon && (
        <div className="grid size-14 place-items-center rounded-2xl bg-surface-2 text-2xl" aria-hidden>
          {icon}
        </div>
      )}
      <h3 className="display mt-4 text-2xl">{title}</h3>
      {children && <p className="mt-2 max-w-sm text-sm muted">{children}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}

export function PageHeader({
  eyebrow,
  title,
  children,
  actions,
}: {
  eyebrow?: string
  title: ReactNode
  children?: ReactNode
  actions?: ReactNode
}) {
  return (
    <header className="rise mb-8 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1 className="display mt-2 text-5xl sm:text-6xl">{title}</h1>
        {children && <p className="mt-3 max-w-xl muted">{children}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </header>
  )
}

export function Markdown({ source, className = '' }: { source: string | null | undefined; className?: string }) {
  if (!source?.trim()) return null
  return <div className={`prose-body ${className}`} dangerouslySetInnerHTML={{ __html: renderMarkdown(source) }} />
}

export function SportTag({ sport, size = 'sm' }: { sport: Sport | undefined; size?: 'sm' | 'md' }) {
  if (!sport) return null
  return (
    <span
      className={`tag ${size === 'md' ? 'text-[12px]' : ''}`}
      style={{ background: `color-mix(in oklab, ${sport.color} 16%, transparent)`, color: sport.color }}
    >
      {sport.emoji && <span aria-hidden>{sport.emoji}</span>}
      {sport.name}
    </span>
  )
}

export function KindTag({ kind }: { kind: EventKind }) {
  const k = kindOf(kind)
  return (
    <span className="tag" style={{ background: `color-mix(in oklab, ${k.color} 14%, transparent)`, color: k.color }}>
      {k.label}
    </span>
  )
}

export function SeasonTag({ season }: { season: Season }) {
  const s = seasonOf(season)
  return (
    <span className="tag" style={{ background: `color-mix(in oklab, ${s.color} 14%, transparent)`, color: s.color }}>
      {s.label}
    </span>
  )
}

export function Avatar({ name, url, size = 36 }: { name: string; url?: string | null; size?: number }) {
  const initials =
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase())
      .join('') || '?'
  if (url) {
    return (
      <img
        src={url}
        alt=""
        width={size}
        height={size}
        referrerPolicy="no-referrer"
        className="shrink-0 rounded-full object-cover"
        style={{ width: size, height: size }}
      />
    )
  }
  return (
    <span
      className="grid shrink-0 place-items-center rounded-full bg-ink font-bold text-paper"
      style={{ width: size, height: size, fontSize: size * 0.38 }}
      aria-hidden
    >
      {initials}
    </span>
  )
}

function useEscape(onClose: () => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [onClose])
}

export function Drawer({ onClose, label, children }: { onClose: () => void; label: string; children: ReactNode }) {
  useEscape(onClose)
  return createPortal(
    <>
      <div className="scrim" onClick={onClose} aria-hidden />
      <aside className="drawer" role="dialog" aria-modal="true" aria-label={label}>
        {/* Bottom-sheet grabber on phones. */}
        <span className="pointer-events-none absolute left-1/2 top-2 z-10 h-1 w-10 -translate-x-1/2 rounded-full bg-[var(--line-strong)] sm:hidden" aria-hidden />
        {children}
      </aside>
    </>,
    document.body,
  )
}

export function Modal({
  onClose,
  title,
  children,
  footer,
}: {
  onClose: () => void
  title: string
  children: ReactNode
  footer?: ReactNode
}) {
  useEscape(onClose)
  return createPortal(
    <>
      <div className="scrim" onClick={onClose} aria-hidden />
      <div className="modal" role="dialog" aria-modal="true" aria-label={title}>
        <div className="sticky top-0 z-10 flex items-center justify-between border-b hairline bg-surface px-6 py-4">
          <h2 className="display text-2xl">{title}</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
            <CloseIcon />
          </button>
        </div>
        <div className="px-6 py-5">{children}</div>
        {footer && (
          <div className="sticky bottom-0 flex flex-wrap items-center justify-end gap-2 border-t hairline bg-surface px-6 py-4">
            {footer}
          </div>
        )}
      </div>
    </>,
    document.body,
  )
}

export function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden>
      <path d="M6 6l12 12M18 6 6 18" strokeLinecap="round" />
    </svg>
  )
}

export function Chevron({ dir = 'right', className = 'size-4' }: { dir?: 'left' | 'right' | 'down'; className?: string }) {
  const d = { left: 'm15 6-6 6 6 6', right: 'm9 6 6 6-6 6', down: 'm6 9 6 6 6-6' }[dir]
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden>
      <path d={d} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="field">
      <span className="label">{label}</span>
      {children}
      {hint && <span className="text-xs faint">{hint}</span>}
    </label>
  )
}

/* ------------------------------------------------------------------ */
/* Toasts                                                              */
/* ------------------------------------------------------------------ */

const ToastContext = createContext<(msg: string) => void>(() => {})

export function ToastProvider({ children }: { children: ReactNode }) {
  const [msg, setMsg] = useState<{ text: string; id: number } | null>(null)
  const timer = useRef<number | undefined>(undefined)
  const show = useCallback((text: string) => {
    setMsg({ text, id: Date.now() })
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setMsg(null), 2800)
  }, [])
  return (
    <ToastContext.Provider value={show}>
      {children}
      {msg && (
        <div className="toast" role="status" key={msg.id}>
          {msg.text}
        </div>
      )}
    </ToastContext.Provider>
  )
}

export const useToast = () => useContext(ToastContext)
