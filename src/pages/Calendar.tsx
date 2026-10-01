import type { ReactNode } from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useData } from '../context/DataContext'
import {
  addDays,
  addMonths,
  coversDay,
  dayKey,
  fmtDayLong,
  fmtMonth,
  fmtTime,
  fmtWeekday,
  fromDayKey,
  monthGrid,
  relative,
  sameDay,
  startOfDay,
  weekDays,
} from '../lib/dates'
import { signupCloses, useEventsRange } from '../lib/events'
import { buildIcs, downloadIcs } from '../lib/ics'
import { supabase } from '../lib/supabase'
import { EVENT_KINDS, kindOf } from '../lib/meta'
import type { EventKind, GEvent } from '../lib/types'
import EventDrawer, { Scoreline } from '../components/EventDrawer'
import EventForm from '../components/admin/EventForm'
import { Chevron, Drawer, Notice } from '../components/ui'

type View = 'month' | 'week' | 'list'
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export default function Calendar() {
  const { access, session } = useAuth()
  const { sports, sportById, follows } = useData()
  const [params, setParams] = useSearchParams()

  const today = startOfDay(new Date())
  const selected = params.get('d') ? fromDayKey(params.get('d')!) : today
  const view = (params.get('v') as View) || (window.innerWidth < 640 ? 'list' : 'month')
  const openId = params.get('event')

  const [kinds, setKinds] = useState<Set<EventKind>>(new Set())
  const [sportFilter, setSportFilter] = useState<Set<string>>(new Set())
  const [myTeams, setMyTeams] = useState(false)
  const [query, setQuery] = useState('')
  const [editing, setEditing] = useState<GEvent | null | 'new'>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  const patch = useCallback(
    (next: Record<string, string | null>) => {
      setParams(
        (prev) => {
          const p = new URLSearchParams(prev)
          for (const [k, v] of Object.entries(next)) {
            if (v == null) p.delete(k)
            else p.set(k, v)
          }
          return p
        },
        { replace: true },
      )
    },
    [setParams],
  )

  const select = (d: Date) => patch({ d: sameDay(d, today) ? null : dayKey(d) })
  const setView = (v: View) => patch({ v })

  // Fetch the whole 6-week grid around the selected month; week and list
  // views are always inside it.
  const grid = useMemo(() => monthGrid(selected), [selected.getFullYear(), selected.getMonth()])
  const { events, loading, error, reload } = useEventsRange(grid[0], addDays(grid[41], 1))

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return events.filter((e) => {
      if (kinds.size && !kinds.has(e.kind)) return false
      if (sportFilter.size && !(e.sport_id && sportFilter.has(e.sport_id))) return false
      if (myTeams && !(e.sport_id && follows.has(e.sport_id))) return false
      if (q) {
        const hay = [e.title, e.location, e.opponent, e.sport_id ? sportById.get(e.sport_id)?.name : '']
          .join(' ')
          .toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [events, kinds, sportFilter, myTeams, follows, query, sportById])

  const byDay = useMemo(() => {
    const map = new Map<string, GEvent[]>()
    for (const day of grid) {
      map.set(
        dayKey(day),
        filtered.filter((e) => coversDay(e.starts_at, e.ends_at, day)),
      )
    }
    return map
  }, [filtered, grid])

  const openEvent = openId ? events.find((e) => e.id === openId) ?? null : null
  const [linked, setLinked] = useState<GEvent | null>(null)

  // A shared link (?event=id) to a date outside the current month: jump there.
  useEffect(() => {
    if (!openId || loading || openEvent || linked?.id === openId) return
    let cancelled = false
    void supabase
      .from('events')
      .select('*')
      .eq('id', openId)
      .maybeSingle()
      .then(({ data }) => {
      if (cancelled) return
      if (data) {
        setLinked(data as GEvent)
        patch({ d: dayKey(new Date((data as GEvent).starts_at)) })
      } else patch({ event: null })
    })
    return () => {
      cancelled = true
    }
  }, [openId, loading, openEvent, linked, patch])

  const drawerEvent = openEvent ?? (linked?.id === openId ? linked : null)

  // Keyboard: arrows move the day, T today, N/P page, M/W/L views, / search.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target instanceof Element ? e.target : null
      if (t?.closest('input, textarea, select, [contenteditable], [role=dialog]') || e.metaKey || e.ctrlKey || e.altKey) return
      const step = view === 'month' ? { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 } : { ArrowLeft: -1, ArrowRight: 1 }
      const delta = (step as Record<string, number>)[e.key]
      if (delta) {
        e.preventDefault()
        select(addDays(selected, delta))
        return
      }
      switch (e.key.toLowerCase()) {
        case 't':
          select(today)
          break
        case 'n':
          select(view === 'week' ? addDays(selected, 7) : addMonths(selected, 1))
          break
        case 'p':
          select(view === 'week' ? addDays(selected, -7) : addMonths(selected, -1))
          break
        case 'm':
          setView('month')
          break
        case 'w':
          setView('week')
          break
        case 'l':
          setView('list')
          break
        case '/':
          e.preventDefault()
          searchRef.current?.focus()
          break
        default:
          return
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const page = (dir: 1 | -1) => select(view === 'week' ? addDays(selected, 7 * dir) : addMonths(selected, dir))
  const title = view === 'week' ? weekTitle(selected) : fmtMonth(selected)
  const filtersOn = kinds.size + sportFilter.size + (myTeams ? 1 : 0) + (query ? 1 : 0)

  function exportView() {
    const inMonth = filtered.filter((e) => new Date(e.starts_at).getMonth() === selected.getMonth())
    downloadIcs(`gcs-athletics-${dayKey(selected).slice(0, 7)}`, buildIcs(inMonth, sportById))
  }

  return (
    <div className="rise">
      {/* ---------- Title bar ---------- */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Calendar</p>
          <h1 className="display mt-2 text-5xl sm:text-6xl">{title}</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center rounded-full border border-[var(--line-strong)] bg-surface">
            <button type="button" className="icon-btn" onClick={() => page(-1)} aria-label="Previous">
              <Chevron dir="left" />
            </button>
            <button type="button" className="px-2 text-sm font-semibold" onClick={() => select(today)}>
              Today
            </button>
            <button type="button" className="icon-btn" onClick={() => page(1)} aria-label="Next">
              <Chevron dir="right" />
            </button>
          </div>
          <div className="segmented">
            {(['month', 'week', 'list'] as View[]).map((v) => (
              <button key={v} type="button" aria-pressed={view === v} onClick={() => setView(v)} className="capitalize">
                {v}
              </button>
            ))}
          </div>
          {access.is_admin && (
            <button type="button" className="btn btn-primary btn-sm" onClick={() => setEditing('new')}>
              + Event
            </button>
          )}
        </div>
      </div>

      {/* ---------- Filters ---------- */}
      <div className="mt-6 flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-full sm:w-64">
            <svg viewBox="0 0 24 24" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 faint" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden>
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.5-3.5" strokeLinecap="round" />
            </svg>
            <input
              ref={searchRef}
              className="input !rounded-full !py-2 pl-9 text-sm"
              placeholder="Search events"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Search events"
            />
          </div>
          {session && follows.size > 0 && (
            <button type="button" className="chip" aria-pressed={myTeams} onClick={() => setMyTeams((m) => !m)}>
              ★ My teams
            </button>
          )}
          <div className="scroll-x -mx-4 flex gap-1.5 px-4 sm:mx-0 sm:px-0">
            {EVENT_KINDS.filter((k) => k.id !== 'other').map((k) => (
              <button
                key={k.id}
                type="button"
                className="chip"
                aria-pressed={kinds.has(k.id)}
                onClick={() => setKinds((s) => toggle(s, k.id))}
              >
                <span className="dot" style={{ ['--pill' as string]: k.color }} />
                {k.label}
              </button>
            ))}
          </div>
          {filtersOn > 0 && (
            <button
              type="button"
              className="btn btn-quiet btn-sm"
              onClick={() => {
                setKinds(new Set())
                setSportFilter(new Set())
                setMyTeams(false)
                setQuery('')
              }}
            >
              Clear
            </button>
          )}
        </div>
        <div className="scroll-x -mx-4 flex gap-1.5 px-4 sm:mx-0 sm:flex-wrap sm:px-0">
          {sports.map((s) => (
            <button
              key={s.id}
              type="button"
              className="chip"
              aria-pressed={sportFilter.has(s.id)}
              onClick={() => setSportFilter((set) => toggle(set, s.id))}
              style={sportFilter.has(s.id) ? { background: s.color, borderColor: s.color, color: '#fff' } : undefined}
            >
              <span aria-hidden>{s.emoji}</span>
              {s.name}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="mt-4">
          <Notice tone="error">{error}</Notice>
        </div>
      )}

      {/* ---------- Body ---------- */}
      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className={`min-w-0 transition-opacity ${loading ? 'opacity-60' : ''}`}>
          {view === 'month' && (
            <MonthView
              grid={grid}
              anchor={selected}
              today={today}
              selected={selected}
              byDay={byDay}
              onSelect={(d) => {
                select(d)
                // Phones and tablets: the day's list sits below the grid, so bring it into view.
                if (window.innerWidth < 1024) {
                  requestAnimationFrame(() => document.getElementById('day-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
                }
              }}
              onOpen={(e) => patch({ event: e.id })}
            />
          )}
          {view === 'week' && <WeekView days={weekDays(selected)} today={today} byDay={byDay} onOpen={(e) => patch({ event: e.id })} onSelect={select} />}
          {view === 'list' && <ListView anchor={selected} today={today} events={filtered} onOpen={(e) => patch({ event: e.id })} />}

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs faint">
            <span className="hidden sm:inline">
              <Kbd>←</Kbd>
              <Kbd>→</Kbd> move · <Kbd>T</Kbd> today · <Kbd>N</Kbd>/<Kbd>P</Kbd> next/prev · <Kbd>M</Kbd>
              <Kbd>W</Kbd>
              <Kbd>L</Kbd> views · <Kbd>/</Kbd> search
            </span>
            <button type="button" className="btn btn-quiet btn-sm" onClick={exportView}>
              ⤓ Add this month to my calendar (.ics)
            </button>
          </div>
        </div>

        <aside className="space-y-6">
          <DayPanel day={selected} events={byDay.get(dayKey(selected)) ?? []} onOpen={(e) => patch({ event: e.id })} />
          <Deadlines onOpen={(e) => patch({ event: e.id })} />
        </aside>
      </div>

      {drawerEvent && (
        <Drawer label={drawerEvent.title} onClose={() => patch({ event: null })}>
          <EventDrawer
            key={drawerEvent.id}
            event={drawerEvent}
            onClose={() => patch({ event: null })}
            onEdit={(e) => {
              patch({ event: null })
              setEditing(e)
            }}
          />
        </Drawer>
      )}

      {editing && (
        <EventForm
          event={editing === 'new' ? null : editing}
          defaultDay={selected}
          onClose={() => setEditing(null)}
          onSaved={() => void reload()}
        />
      )}
    </div>
  )
}

function toggle<T>(set: Set<T>, v: T) {
  const next = new Set(set)
  if (next.has(v)) next.delete(v)
  else next.add(v)
  return next
}

function weekTitle(d: Date) {
  const days = weekDays(d)
  const a = days[0]
  const b = days[6]
  const month = (x: Date) => x.toLocaleString('en-US', { month: 'short' })
  return a.getMonth() === b.getMonth()
    ? `${month(a)} ${a.getDate()} – ${b.getDate()}`
    : `${month(a)} ${a.getDate()} – ${month(b)} ${b.getDate()}`
}

function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="mx-0.5 inline-grid min-w-5 place-items-center rounded border border-[var(--line-strong)] bg-surface px-1 font-sans text-[10px] font-semibold">
      {children}
    </kbd>
  )
}

function useColor() {
  const { sportById } = useData()
  return (e: GEvent) => (e.sport_id ? sportById.get(e.sport_id)?.color : null) ?? kindOf(e.kind).color
}

/* ------------------------------------------------------------------ */

function MonthView({
  grid,
  anchor,
  today,
  selected,
  byDay,
  onSelect,
  onOpen,
}: {
  grid: Date[]
  anchor: Date
  today: Date
  selected: Date
  byDay: Map<string, GEvent[]>
  onSelect: (d: Date) => void
  onOpen: (e: GEvent) => void
}) {
  const color = useColor()
  return (
    <div className="card overflow-hidden">
      <div className="cal-grid border-b hairline bg-surface-2/50">
        {WEEKDAYS.map((w, i) => (
          <div key={w} className={`py-2 text-center text-[11px] font-bold uppercase tracking-wider ${i === 0 ? 'text-signal' : 'muted'}`}>
            {w}
          </div>
        ))}
      </div>
      <div className="cal-grid" role="grid" aria-label={fmtMonth(anchor)}>
        {grid.map((day, idx) => {
          const list = byDay.get(dayKey(day)) ?? []
          const outside = day.getMonth() !== anchor.getMonth()
          const isToday = sameDay(day, today)
          const isSel = sameDay(day, selected)
          const shown = list.slice(0, 3)
          return (
            <div
              key={idx}
              role="gridcell"
              aria-selected={isSel}
              aria-label={`${fmtDayLong(day)}, ${list.length} ${list.length === 1 ? 'event' : 'events'}`}
              className={`cal-cell ${outside ? 'outside' : ''} ${isToday ? 'today' : ''} ${isSel ? 'selected' : ''} ${idx >= 35 ? '!border-b-0' : ''} max-sm:!min-h-[64px]`}
              onClick={() => onSelect(day)}
            >
              <span className="cal-daynum">{day.getDate()}</span>
              {/* Phones: dots. Wider: labelled pills. */}
              <div className="flex flex-wrap gap-1 px-1 sm:hidden">
                {list.slice(0, 4).map((e) => (
                  <span key={e.id} className="dot" style={{ ['--pill' as string]: color(e) }} />
                ))}
              </div>
              <div className="hidden flex-col gap-[3px] sm:flex">
                {shown.map((e) => (
                  <button
                    key={e.id}
                    type="button"
                    className={`cal-pill ${e.kind === 'deadline' ? 'deadline' : ''} ${e.cancelled ? 'cancelled' : ''}`}
                    style={{ ['--pill' as string]: color(e) }}
                    onClick={(ev) => {
                      ev.stopPropagation()
                      onOpen(e)
                    }}
                    title={e.title}
                  >
                    {e.kind === 'deadline' && <span aria-hidden>⏱</span>}
                    <span className="t">{e.title}</span>
                    {!e.all_day && sameDay(new Date(e.starts_at), day) && <span className="time">{fmtTime(e.starts_at)}</span>}
                  </button>
                ))}
                {list.length > 3 && <span className="px-1.5 text-[11px] font-semibold muted">+{list.length - 3} more</span>}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function WeekView({
  days,
  today,
  byDay,
  onOpen,
  onSelect,
}: {
  days: Date[]
  today: Date
  byDay: Map<string, GEvent[]>
  onOpen: (e: GEvent) => void
  onSelect: (d: Date) => void
}) {
  const color = useColor()
  const { sportById } = useData()
  return (
    <div className="grid gap-2 md:grid-cols-7">
      {days.map((day) => {
        const list = byDay.get(dayKey(day)) ?? []
        const isToday = sameDay(day, today)
        return (
          <div key={dayKey(day)} className={`card flex min-h-40 flex-col p-2.5 ${isToday ? 'ring-2 ring-[var(--volt)]' : ''}`} onClick={() => onSelect(day)}>
            <div className="flex items-baseline gap-2 px-1 md:flex-col md:gap-0">
              <span className="eyebrow">{fmtWeekday(day)}</span>
              <span className={`display text-3xl ${isToday ? 'text-signal' : ''}`}>{day.getDate()}</span>
            </div>
            <div className="mt-2 flex flex-col gap-1.5">
              {list.length === 0 && <span className="px-1 text-xs faint">—</span>}
              {list.map((e) => {
                const sport = e.sport_id ? sportById.get(e.sport_id) : undefined
                return (
                  <button
                    key={e.id}
                    type="button"
                    onClick={(ev) => {
                      ev.stopPropagation()
                      onOpen(e)
                    }}
                    className={`rounded-lg border-l-[3px] p-2 text-left text-[13px] transition hover:translate-x-px ${e.cancelled ? 'line-through opacity-50' : ''}`}
                    style={{ borderColor: color(e), background: `color-mix(in oklab, ${color(e)} 12%, var(--surface))` }}
                  >
                    <span className="block text-[11px] font-semibold muted num">{e.all_day ? 'All day' : fmtTime(e.starts_at)}</span>
                    <span className="block font-semibold leading-snug">{e.title}</span>
                    {sport && <span className="mt-0.5 block text-[11px] muted">{sport.emoji} {sport.name}</span>}
                  </button>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function ListView({ anchor, today, events, onOpen }: { anchor: Date; today: Date; events: GEvent[]; onOpen: (e: GEvent) => void }) {
  const inMonth = events.filter((e) => {
    const s = new Date(e.starts_at)
    return s.getMonth() === anchor.getMonth() && s.getFullYear() === anchor.getFullYear()
  })
  const groups = new Map<string, GEvent[]>()
  for (const e of inMonth) {
    const k = dayKey(new Date(e.starts_at))
    groups.set(k, [...(groups.get(k) ?? []), e])
  }
  const todayRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    todayRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' })
  }, [anchor.getMonth()])

  if (!inMonth.length) {
    return (
      <div className="card lanes px-6 py-16 text-center">
        <p className="display text-3xl">Nothing on the board</p>
        <p className="mt-2 text-sm muted">No events match this month{events.length ? ' and these filters' : ''}.</p>
      </div>
    )
  }

  const firstUpcoming = [...groups.keys()].find((k) => fromDayKey(k) >= today)
  return (
    <div className="space-y-3">
      {[...groups.entries()].map(([k, list]) => {
        const day = fromDayKey(k)
        const past = day < today
        return (
          <div key={k} ref={k === firstUpcoming ? todayRef : undefined} className={`card flex gap-4 p-4 scroll-mt-24 ${past ? 'opacity-60' : ''}`}>
            <div className="w-14 shrink-0 text-center">
              <div className="eyebrow">{fmtWeekday(day)}</div>
              <div className={`display text-4xl ${sameDay(day, today) ? 'text-signal' : ''}`}>{day.getDate()}</div>
            </div>
            <div className="min-w-0 flex-1 divide-y divide-[var(--line)]">
              {list.map((e) => (
                <EventRow key={e.id} event={e} onOpen={onOpen} />
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

export function EventRow({ event: e, onOpen, showDate = false }: { event: GEvent; onOpen: (e: GEvent) => void; showDate?: boolean }) {
  const { sportById } = useData()
  const sport = e.sport_id ? sportById.get(e.sport_id) : undefined
  const k = kindOf(e.kind)
  return (
    <button type="button" onClick={() => onOpen(e)} className="group flex w-full items-center gap-3 py-2.5 text-left first:pt-0 last:pb-0">
      <span className="h-10 w-1 shrink-0 rounded-full" style={{ background: sport?.color ?? k.color }} />
      <span className="min-w-0 flex-1">
        <span className={`block truncate font-semibold group-hover:text-signal ${e.cancelled ? 'line-through opacity-60' : ''}`}>{e.title}</span>
        <span className="block truncate text-[13px] muted">
          {showDate && `${fmtDayLong(e.starts_at)} · `}
          {e.all_day ? 'All day' : fmtTime(e.starts_at)}
          {sport && ` · ${sport.name}`}
          {e.location && ` · ${e.location}`}
        </span>
      </span>
      <Scoreline event={e} />
      <span className="tag hidden sm:inline-flex" style={{ color: k.color, background: `color-mix(in oklab, ${k.color} 12%, transparent)` }}>
        {k.label}
      </span>
    </button>
  )
}

function DayPanel({ day, events, onOpen }: { day: Date; events: GEvent[]; onOpen: (e: GEvent) => void }) {
  return (
    <section id="day-panel" className="card scroll-mt-24 p-5">
      <p className="eyebrow">{sameDay(day, new Date()) ? 'Today' : relative(day) === 'tomorrow' ? 'Tomorrow' : fmtWeekday(day)}</p>
      <h2 className="display mt-1 text-3xl">{day.toLocaleString('en-US', { month: 'long', day: 'numeric' })}</h2>
      <div className="mt-4 divide-y divide-[var(--line)]">
        {events.length === 0 ? <p className="text-sm faint">Nothing scheduled.</p> : events.map((e) => <EventRow key={e.id} event={e} onOpen={onOpen} />)}
      </div>
    </section>
  )
}

/** Next sign-up windows closing — the thing students most often miss. */
function Deadlines({ onOpen }: { onOpen: (e: GEvent) => void }) {
  const now = useMemo(() => new Date(), [])
  const { events } = useEventsRange(now, addDays(now, 60))
  const { sportById } = useData()
  const soon = events
    .filter((e) => !e.cancelled && (e.kind === 'deadline' || (e.signup_enabled && signupCloses(e) > now)))
    .map((e) => ({ e, at: e.kind === 'deadline' ? new Date(e.starts_at) : signupCloses(e) }))
    .filter((x) => x.at > now)
    .sort((a, b) => a.at.getTime() - b.at.getTime())
    .slice(0, 5)

  return (
    <section className="card overflow-hidden">
      <div className="stage flex items-center justify-between bg-ink px-5 py-3 text-paper">
        <p className="eyebrow !text-paper/70">Closing soon</p>
        <span aria-hidden>⏱</span>
      </div>
      <div className="p-5">
        {soon.length === 0 ? (
          <p className="text-sm faint">No sign-ups closing in the next two months.</p>
        ) : (
          <ul className="space-y-4">
            {soon.map(({ e, at }) => {
              const sport = e.sport_id ? sportById.get(e.sport_id) : undefined
              const hours = (at.getTime() - now.getTime()) / 36e5
              return (
                <li key={e.id}>
                  <button type="button" onClick={() => onOpen(e)} className="group flex w-full items-start gap-3 text-left">
                    <span className={`num mt-0.5 shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-bold ${hours < 48 ? 'bg-signal text-white' : 'bg-surface-2'}`}>
                      {relative(at, now).replace('in ', '')}
                    </span>
                    <span className="min-w-0">
                      <span className="block font-semibold leading-snug group-hover:text-signal">{e.title}</span>
                      <span className="block text-xs muted">
                        {sport ? `${sport.emoji} ${sport.name} · ` : ''}
                        {e.kind === 'deadline' ? 'Due' : 'Sign-ups close'} {at.toLocaleString('en-US', { month: 'short', day: 'numeric' })}, {fmtTime(at)}
                      </span>
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </section>
  )
}
