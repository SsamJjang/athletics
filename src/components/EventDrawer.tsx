import type { ReactNode } from 'react'
import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useData } from '../context/DataContext'
import { fmtDate, fmtRange, fmtTime, relative } from '../lib/dates'
import { fetchTotals, signupCloses, signupOpen } from '../lib/events'
import { buildIcs, downloadIcs, googleCalendarUrl } from '../lib/ics'
import { kindOf } from '../lib/meta'
import { supabase } from '../lib/supabase'
import type { GEvent, Profile, Signup } from '../lib/types'
import { CloseIcon, KindTag, Markdown, SportTag, useToast } from './ui'

export function Scoreline({ event }: { event: GEvent }) {
  if (!event.result && !event.outcome) return null
  const tone =
    event.outcome === 'win' ? 'gold-fill' : event.outcome === 'loss' ? 'bg-ink text-paper' : 'bg-surface-2'
  const word = event.outcome === 'win' ? 'W' : event.outcome === 'loss' ? 'L' : event.outcome === 'draw' ? 'D' : ''
  return (
    <span className={`tag num ${tone}`}>
      {word}
      {word && event.result ? ' · ' : ''}
      {event.result}
    </span>
  )
}

export default function EventDrawer({
  event,
  onClose,
  onEdit,
}: {
  event: GEvent
  onClose: () => void
  onEdit?: (e: GEvent) => void
}) {
  const { session, access, profile } = useAuth()
  const { sportById } = useData()
  const toast = useToast()
  const sport = event.sport_id ? sportById.get(event.sport_id) : undefined
  const kind = kindOf(event.kind)
  const accent = sport?.color ?? kind.color

  const [total, setTotal] = useState(0)
  const [mine, setMine] = useState(false)
  const [busy, setBusy] = useState(false)
  const [roster, setRoster] = useState<(Signup & { profile: Pick<Profile, 'full_name' | 'email' | 'grade'> | null })[] | null>(null)

  const load = useCallback(async () => {
    if (!event.signup_enabled) return
    const totals = await fetchTotals([event.id])
    setTotal(totals.get(event.id) ?? 0)
    if (session) {
      const { data } = await supabase
        .from('event_signups')
        .select('event_id')
        .eq('event_id', event.id)
        .eq('user_id', session.user.id)
        .maybeSingle()
      setMine(Boolean(data))
    }
    if (access.is_admin) {
      const { data } = await supabase
        .from('event_signups')
        .select('*, profile:profiles(full_name,email,grade)')
        .eq('event_id', event.id)
        .order('created_at')
      setRoster((data as typeof roster) ?? [])
    }
  }, [event.id, event.signup_enabled, session, access.is_admin])

  useEffect(() => {
    void load()
  }, [load])

  async function toggleSignup() {
    if (!session) return
    setBusy(true)
    const { error } = mine
      ? await supabase.from('event_signups').delete().eq('event_id', event.id).eq('user_id', session.user.id)
      : await supabase.from('event_signups').insert({ event_id: event.id, user_id: session.user.id })
    setBusy(false)
    if (error) {
      toast(mine ? 'Could not withdraw' : 'Sign-ups just closed or filled up')
    } else {
      toast(mine ? 'You’re off the list' : 'You’re signed up ✓')
    }
    void load()
  }

  function exportRoster() {
    if (!roster) return
    const rows = [['Name', 'Email', 'Grade', 'Signed up'], ...roster.map((r) => [
      r.profile?.full_name ?? '',
      r.profile?.email ?? '',
      String(r.profile?.grade ?? ''),
      new Date(r.created_at).toLocaleString(),
    ])]
    const csv = rows.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(',')).join('\n')
    const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `${event.title.replace(/[^\w]+/g, '-')}-signups.csv`
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  const open = signupOpen(event, total)
  const closes = signupCloses(event)
  const full = event.capacity != null && total >= event.capacity
  const past = new Date(event.ends_at ?? event.starts_at) < new Date()

  return (
    <div>
      {/* Header band in the sport's color */}
      <div className="relative overflow-hidden px-6 pb-6 pt-5" style={{ background: `color-mix(in oklab, ${accent} 14%, var(--surface))` }}>
        <div className="stripes pointer-events-none absolute -right-10 -top-10 size-48 rotate-12 opacity-[0.08]" style={{ color: accent }} aria-hidden />
        <div className="relative flex items-start justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <KindTag kind={event.kind} />
            <SportTag sport={sport} />
            {event.members_only && <span className="tag bg-surface-2">Members only</span>}
          </div>
          <button type="button" className="icon-btn -mr-2 -mt-1" onClick={onClose} aria-label="Close">
            <CloseIcon />
          </button>
        </div>
        <h2 className={`display relative mt-4 text-4xl ${event.cancelled ? 'line-through opacity-60' : ''}`}>{event.title}</h2>
        {event.cancelled && <p className="relative mt-2 text-sm font-bold text-signal">This event is cancelled.</p>}
        {event.opponent && (
          <p className="relative mt-2 text-lg font-semibold">
            <span className="muted">{event.home_away === 'away' ? '@' : 'vs'}</span> {event.opponent}
            {event.home_away && <span className="ml-2 tag bg-surface">{event.home_away}</span>}
          </p>
        )}
        <div className="relative mt-3">
          <Scoreline event={event} />
        </div>
      </div>

      <div className="space-y-6 px-6 py-6">
        <dl className="grid gap-3 text-sm">
          <Row icon="M4 6h16v14H4zM4 10h16M9 3v4M15 3v4" label="When">
            {fmtRange(event.starts_at, event.ends_at, event.all_day)}
            {!past && <span className="ml-2 faint">· {relative(event.starts_at)}</span>}
          </Row>
          {event.location && (
            <Row icon="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21zM12 7.5a2 2 0 1 0 0 4 2 2 0 0 0 0-4z" label="Where">
              {event.location}
            </Row>
          )}
        </dl>

        {event.signup_enabled && (
          <section className="rounded-2xl border hairline p-4">
            <div className="flex items-baseline justify-between gap-3">
              <p className="eyebrow">Sign-up</p>
              <p className="num text-sm font-semibold">
                {total}
                {event.capacity ? ` / ${event.capacity}` : ''} <span className="font-normal muted">signed up</span>
              </p>
            </div>
            {event.capacity ? (
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-2">
                <div className="h-full rounded-full bg-signal transition-all" style={{ width: `${Math.min(100, (total / event.capacity) * 100)}%` }} />
              </div>
            ) : null}
            <p className="mt-3 text-sm">
              {open ? (
                <>
                  Closes <b>{fmtDate(closes)}</b> at {fmtTime(closes)} <span className="muted">({relative(closes)})</span>
                </>
              ) : full ? (
                'This one is full.'
              ) : (
                'Sign-ups are closed.'
              )}
            </p>
            <div className="mt-4">
              {profile?.kind === 'school' ? (
                mine ? (
                  <button type="button" className="btn btn-ghost w-full" disabled={busy} onClick={() => void toggleSignup()}>
                    ✓ You’re in — withdraw
                  </button>
                ) : (
                  <button type="button" className="btn btn-primary w-full" disabled={busy || !open} onClick={() => void toggleSignup()}>
                    Sign me up
                  </button>
                )
              ) : (
                <p className="text-sm muted">Students sign up with their school account.</p>
              )}
            </div>
          </section>
        )}

        <Markdown source={event.description} />

        <div className="flex flex-wrap gap-2">
          <a className="btn btn-ghost btn-sm" href={googleCalendarUrl(event, sport)} target="_blank" rel="noreferrer">
            + Google Calendar
          </a>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => downloadIcs(event.title.replace(/[^\w]+/g, '-'), buildIcs([event], sportById, event.title))}
          >
            Download .ics
          </button>
          <button
            type="button"
            className="btn btn-quiet btn-sm"
            onClick={() => {
              void navigator.clipboard?.writeText(`${window.location.origin}/calendar?event=${event.id}`)
              toast('Link copied')
            }}
          >
            Copy link
          </button>
          {sport && (
            <Link className="btn btn-quiet btn-sm" to={`/sports/${sport.slug}`}>
              About {sport.name} →
            </Link>
          )}
        </div>

        {access.is_admin && (
          <section className="rounded-2xl border border-dashed hairline p-4">
            <div className="flex items-center justify-between">
              <p className="eyebrow">Admin</p>
              {onEdit && (
                <button type="button" className="btn btn-ink btn-sm" onClick={() => onEdit(event)}>
                  Edit event
                </button>
              )}
            </div>
            {event.signup_enabled && roster && (
              <div className="mt-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold">{roster.length} signed up</p>
                  {roster.length > 0 && (
                    <button type="button" className="btn btn-quiet btn-sm" onClick={exportRoster}>
                      Export CSV
                    </button>
                  )}
                </div>
                <ol className="mt-2 max-h-64 space-y-1 overflow-y-auto text-sm">
                  {roster.map((r, i) => (
                    <li key={r.user_id} className="flex items-baseline gap-2">
                      <span className="num w-6 text-right faint">{i + 1}</span>
                      <span className="font-medium">{r.profile?.full_name || r.profile?.email}</span>
                      {r.profile?.grade && <span className="text-xs faint">Gr {r.profile.grade}</span>}
                    </li>
                  ))}
                </ol>
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  )
}

function Row({ icon, label, children }: { icon: string; label: string; children: ReactNode }) {
  return (
    <div className="flex gap-3">
      <dt className="mt-0.5 shrink-0 muted" title={label}>
        <svg viewBox="0 0 24 24" className="size-[18px]" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinejoin="round" aria-hidden>
          <path d={icon} />
        </svg>
        <span className="sr-only">{label}</span>
      </dt>
      <dd className="font-medium">{children}</dd>
    </div>
  )
}
