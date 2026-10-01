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
import { supabase } from '../lib/supabase'
import { EVENT_KINDS, kindOf } from '../lib/meta'
import type { EventKind, GEvent, Sport } from '../lib/types'
import EventDrawer, { Scoreline } from '../components/EventDrawer'
import EventForm from '../components/admin/EventForm'
import MiniMonth from '../components/calendar/MiniMonth'
import MonthGrid from '../components/calendar/MonthGrid'
import SubscribeDialog from '../components/calendar/SubscribeDialog'
import TimeGrid from '../components/calendar/TimeGrid'
import { Chevron, Drawer, Notice } from '../components/ui'

type View = 'day' | 'week' | 'month' | 'schedule'
const VIEWS: { id: View; label: string; key: string }[] = [
  { id: 'day', label: 'Day', key: 'D' },
  { id: 'week', label: 'Week', key: 'W' },
  { id: 'month', label: 'Month', key: 'M' },
  { id: 'schedule', label: 'Schedule', key: 'A' },
]
const GENERAL = 'general' // the calendar for events with no sport

/* ------------------------------------------------------------------ */
/* Small hooks                                                         */
/* ------------------------------------------------------------------ */

function useNarrow(px = 640) {
  const [narrow, setNarrow] = useState(() => window.innerWidth < px)
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${px - 1}px)`)
    const on = () => setNarrow(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [px])
  return narrow
}

/** A Set remembered in this browser — which calendars someone has unticked. */
function useStoredSet<T extends string>(key: string) {
  const [set, setSet] = useState<Set<T>>(() => {
    try {
      return new Set(JSON.parse(localStorage.getItem(key) ?? '[]') as T[])
    } catch {
      return new Set()
    }
  })
  const update = useCallback(
    (next: Set<T>) => {
      setSet(next)
      try {
        localStorage.setItem(key, JSON.stringify([...next]))
      } catch {
        /* private mode: still works for this visit */
      }
    },
    [key],
  )
  return [set, update] as const
}

function toggled<T>(set: Set<T>, v: T) {
  const next = new Set(set)
  if (next.has(v)) next.delete(v)
  else next.add(v)
  return next
}

/* ------------------------------------------------------------------ */

export default function Calendar() {
  const { access } = useAuth()
  const { sports, sportById, myTeams, follows } = useData()
  const [params, setParams] = useSearchParams()
  const narrow = useNarrow()

  const today = startOfDay(new Date())
  const selected = params.get('d') ? fromDayKey(params.get('d')!) : today
  const rawView = params.get('v')
  const view: View = rawView === 'list' ? 'schedule' : VIEWS.some((v) => v.id === rawView) ? (rawView as View) : narrow ? 'schedule' : 'month'
  const openId = params.get('event')

  const [hidden, setHidden] = useStoredSet<string>('gcs-cal-hidden')
  const [hiddenKinds, setHiddenKinds] = useStoredSet<EventKind>('gcs-cal-kinds')
  const [query, setQuery] = useState('')
  const [editing, setEditing] = useState<GEvent | 'new' | null>(null)
  const [createAt, setCreateAt] = useState<Date | undefined>(undefined)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [subscribing, setSubscribing] = useState(false)
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
  const goDay = (d: Date) => patch({ d: sameDay(d, today) ? null : dayKey(d), v: 'day' })

  // Week view shows 3 days on phones, like Google Calendar's mobile app.
  const shownDays = useMemo(() => {
    if (view === 'day') return [selected]
    if (view === 'week') return narrow ? [selected, addDays(selected, 1), addDays(selected, 2)] : weekDays(selected)
    return []
  }, [view, dayKey(selected), narrow]) // eslint-disable-line react-hooks/exhaustive-deps

  const grid = useMemo(() => monthGrid(selected), [selected.getFullYear(), selected.getMonth()]) // eslint-disable-line react-hooks/exhaustive-deps

  const [from, to] = useMemo(() => {
    if (view === 'month') return [grid[0], addDays(grid[41], 1)]
    if (view === 'schedule') return [selected, addDays(selected, 90)]
    return [shownDays[0], addDays(shownDays[shownDays.length - 1], 1)]
  }, [view, grid, shownDays, dayKey(selected)]) // eslint-disable-line react-hooks/exhaustive-deps
  const { events, loading, error, reload } = useEventsRange(from, to)

  const colorOf = useCallback(
    (e: GEvent) => (e.sport_id ? sportById.get(e.sport_id)?.color : null) ?? kindOf(e.kind).color,
    [sportById],
  )

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return events.filter((e) => {
      if (hidden.has(e.sport_id ?? GENERAL)) return false
      if (hiddenKinds.has(e.kind)) return false
      if (q) {
        const hay = [e.title, e.location, e.opponent, e.sport_id ? sportById.get(e.sport_id)?.name : ''].join(' ').toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [events, hidden, hiddenKinds, query, sportById])

  const byDay = useMemo(() => {
    const map = new Map<string, GEvent[]>()
    for (const day of grid) map.set(dayKey(day), filtered.filter((e) => coversDay(e.starts_at, e.ends_at, day)))
    return map
  }, [filtered, grid])

  const busyDays = useMemo(() => new Set(filtered.map((e) => dayKey(new Date(e.starts_at)))), [filtered])

  /* ---- deep links: ?event=id anywhere in time ---- */
  const openEvent = openId ? events.find((e) => e.id === openId) ?? null : null
  const [linked, setLinked] = useState<GEvent | null>(null)
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

  /* ---- paging ---- */
  const step = (dir: 1 | -1) => {
    if (view === 'day') return select(addDays(selected, dir))
    if (view === 'week') return select(addDays(selected, dir * (narrow ? 3 : 7)))
    return select(addMonths(selected, dir))
  }

  const startCreate = (at?: Date) => {
    setCreateAt(at)
    setEditing('new')
  }

  /* ---- keyboard: Google Calendar's own shortcuts ---- */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target instanceof Element ? e.target : null
      if (t?.closest('input, textarea, select, [contenteditable], [role=dialog]') || e.metaKey || e.ctrlKey || e.altKey) return
      const k = e.key.toLowerCase()
      if (k === 'arrowleft' || k === 'arrowright') {
        e.preventDefault()
        select(addDays(selected, k === 'arrowleft' ? -1 : 1))
        return
      }
      switch (k) {
        case 't':
          select(today)
          break
        case 'j':
        case 'n':
          step(1)
          break
        case 'k':
        case 'p':
          step(-1)
          break
        case 'd':
          setView('day')
          break
        case 'w':
          setView('week')
          break
        case 'm':
          setView('month')
          break
        case 'a':
          setView('schedule')
          break
        case 'c':
          if (access.is_admin) startCreate()
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

  const title =
    view === 'day'
      ? selected.toLocaleString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
      : view === 'week'
        ? rangeTitle(shownDays)
        : fmtMonth(selected)

  const sidebar = (
    <Sidebar
      selected={selected}
      today={today}
      busyDays={busyDays}
      onPick={(d) => {
        select(d)
        setSidebarOpen(false)
      }}
      query={query}
      setQuery={setQuery}
      searchRef={searchRef}
      sports={sports}
      myTeams={myTeams}
      follows={follows}
      hidden={hidden}
      setHidden={setHidden}
      hiddenKinds={hiddenKinds}
      setHiddenKinds={setHiddenKinds}
      canCreate={access.is_admin}
      onCreate={() => {
        setSidebarOpen(false)
        startCreate()
      }}
      onSubscribe={() => {
        setSidebarOpen(false)
        setSubscribing(true)
      }}
      onOpen={(e) => {
        setSidebarOpen(false)
        patch({ event: e.id })
      }}
    />
  )

  const filtersOn = hidden.size + hiddenKinds.size + (query ? 1 : 0)

  return (
    <div className="rise grid gap-6 lg:grid-cols-[248px_minmax(0,1fr)]">
      {/* ---------- Sidebar (desktop) ---------- */}
      <aside className="hidden lg:block">
        <div className="sticky top-24 max-h-[calc(100dvh-7rem)] overflow-y-auto pb-6 pr-1">{sidebar}</div>
      </aside>

      {/* ---------- Main ---------- */}
      <div className="min-w-0">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="btn btn-ghost btn-sm lg:hidden"
            onClick={() => setSidebarOpen(true)}
            aria-label="Calendars and filters"
          >
            <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden>
              <path d="M4 6h16M7 12h10M10 18h4" strokeLinecap="round" />
            </svg>
            {filtersOn > 0 && <span className="grid size-4 place-items-center rounded-full bg-signal text-[10px] text-white">{filtersOn}</span>}
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => select(today)}>
            Today
          </button>
          <span className="flex">
            <button type="button" className="icon-btn" onClick={() => step(-1)} aria-label="Previous">
              <Chevron dir="left" />
            </button>
            <button type="button" className="icon-btn" onClick={() => step(1)} aria-label="Next">
              <Chevron dir="right" />
            </button>
          </span>
          <h1 className="display min-w-0 flex-1 truncate text-3xl max-sm:order-first max-sm:basis-full sm:text-4xl">{title}</h1>

          {/* View switcher: buttons on wide screens, a select on phones */}
          <div className="segmented hidden sm:inline-flex">
            {VIEWS.map((v) => (
              <button key={v.id} type="button" aria-pressed={view === v.id} onClick={() => setView(v.id)} title={`${v.label} (${v.key})`}>
                {v.label}
              </button>
            ))}
          </div>
          <select className="input ml-auto !w-auto !rounded-full !py-1.5 text-sm font-semibold sm:hidden" value={view} onChange={(e) => setView(e.target.value as View)} aria-label="View">
            {VIEWS.map((v) => (
              <option key={v.id} value={v.id}>
                {v.label}
              </option>
            ))}
          </select>
        </div>

        {error && (
          <div className="mb-4">
            <Notice tone="error">{error}</Notice>
          </div>
        )}

        <div className={`transition-opacity ${loading ? 'opacity-60' : ''}`}>
          {view === 'month' && (
            <MonthGrid
              grid={grid}
              anchor={selected}
              today={today}
              byDay={byDay}
              colorOf={colorOf}
              onOpen={(e) => patch({ event: e.id })}
              onPickDay={(d) => (narrow ? goDay(d) : select(d))}
            />
          )}
          {(view === 'week' || view === 'day') && (
            <TimeGrid
              days={shownDays}
              events={filtered}
              today={today}
              colorOf={colorOf}
              onOpen={(e) => patch({ event: e.id })}
              onPickDay={goDay}
              onCreateAt={access.is_admin ? startCreate : undefined}
            />
          )}
          {view === 'schedule' && <Schedule from={selected} today={today} events={filtered} onOpen={(e) => patch({ event: e.id })} />}
        </div>

        <p className="mt-4 hidden text-xs faint lg:block">
          <Kbd>T</Kbd> today · <Kbd>J</Kbd>/<Kbd>K</Kbd> next/previous · <Kbd>D</Kbd>
          <Kbd>W</Kbd>
          <Kbd>M</Kbd>
          <Kbd>A</Kbd> views · <Kbd>/</Kbd> search{access.is_admin && <> · <Kbd>C</Kbd> create · click an empty time slot to add an event there</>}
        </p>
      </div>

      {/* Phones: floating Create button, above the tab bar. */}
      {access.is_admin && (
        <button
          type="button"
          onClick={() => startCreate()}
          className="fixed bottom-24 right-4 z-30 grid size-14 place-items-center rounded-2xl bg-signal text-3xl font-light text-white shadow-[var(--shadow-lg)] transition active:scale-95 lg:hidden"
          aria-label="Create event"
        >
          +
        </button>
      )}

      {sidebarOpen && (
        <Drawer label="Calendars" onClose={() => setSidebarOpen(false)}>
          <div className="p-5 pt-8">{sidebar}</div>
        </Drawer>
      )}

      {drawerEvent && (
        <Drawer label={drawerEvent.title} onClose={() => patch({ event: null })}>
          <EventDrawer
            key={drawerEvent.id}
            event={drawerEvent}
            onClose={() => patch({ event: null })}
            onEdit={(e) => {
              patch({ event: null })
              setCreateAt(undefined)
              setEditing(e)
            }}
          />
        </Drawer>
      )}

      {editing && (
        <EventForm
          event={editing === 'new' ? null : editing}
          defaultDay={selected}
          defaultStart={editing === 'new' ? createAt : undefined}
          onClose={() => setEditing(null)}
          onSaved={() => void reload()}
        />
      )}

      {subscribing && <SubscribeDialog onClose={() => setSubscribing(false)} />}
    </div>
  )
}

function rangeTitle(days: Date[]) {
  const a = days[0]
  const b = days[days.length - 1]
  const m = (x: Date) => x.toLocaleString('en-US', { month: 'short' })
  if (a.getMonth() === b.getMonth()) return `${m(a)} ${a.getDate()} – ${b.getDate()}, ${a.getFullYear()}`
  return `${m(a)} ${a.getDate()} – ${m(b)} ${b.getDate()}`
}

function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="mx-0.5 inline-grid min-w-5 place-items-center rounded border border-[var(--line-strong)] bg-surface px-1 font-sans text-[10px] font-semibold">
      {children}
    </kbd>
  )
}

/* ------------------------------------------------------------------ */
/* Sidebar                                                             */
/* ------------------------------------------------------------------ */

function CheckRow({ color, on, onClick, children, badge }: { color: string; on: boolean; onClick: () => void; children: ReactNode; badge?: ReactNode }) {
  return (
    <button type="button" role="checkbox" aria-checked={on} onClick={onClick} className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-surface-2">
      <span
        className="grid size-[18px] shrink-0 place-items-center rounded-[5px] border-2 transition"
        style={{ borderColor: color, background: on ? color : 'transparent' }}
        aria-hidden
      >
        {on && (
          <svg viewBox="0 0 24 24" className="size-3 text-white" fill="none" stroke="currentColor" strokeWidth="3.5">
            <path d="m5 12 5 5 9-10" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </span>
      <span className="min-w-0 flex-1 truncate font-medium">{children}</span>
      {badge}
    </button>
  )
}

function SideHeading({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-1 mt-6 flex items-center justify-between px-2">
      <p className="text-[11px] font-bold uppercase tracking-[0.12em] muted">{children}</p>
      {action}
    </div>
  )
}

function Sidebar({
  selected,
  today,
  busyDays,
  onPick,
  query,
  setQuery,
  searchRef,
  sports,
  myTeams,
  follows,
  hidden,
  setHidden,
  hiddenKinds,
  setHiddenKinds,
  canCreate,
  onCreate,
  onSubscribe,
  onOpen,
}: {
  selected: Date
  today: Date
  busyDays: Set<string>
  onPick: (d: Date) => void
  query: string
  setQuery: (q: string) => void
  searchRef: React.RefObject<HTMLInputElement | null>
  sports: Sport[]
  myTeams: Set<string>
  follows: Set<string>
  hidden: Set<string>
  setHidden: (s: Set<string>) => void
  hiddenKinds: Set<EventKind>
  setHiddenKinds: (s: Set<EventKind>) => void
  canCreate: boolean
  onCreate: () => void
  onSubscribe: () => void
  onOpen: (e: GEvent) => void
}) {
  const mine = sports.filter((s) => myTeams.has(s.id))
  const followed = sports.filter((s) => !myTeams.has(s.id) && follows.has(s.id))
  const others = sports.filter((s) => !myTeams.has(s.id) && !follows.has(s.id))

  return (
    <div>
      {canCreate && (
        <button type="button" onClick={onCreate} className="mb-5 hidden items-center gap-3 rounded-2xl bg-surface py-3.5 pl-4 pr-6 font-semibold shadow-[var(--shadow)] ring-1 ring-[var(--line)] transition hover:shadow-[var(--shadow-lg)] lg:inline-flex">
          <span className="text-2xl font-light leading-none text-signal">+</span>
          Create
        </button>
      )}

      <MiniMonth selected={selected} today={today} busyDays={busyDays} onPick={onPick} />

      <div className="relative mt-5">
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

      {mine.length > 0 && (
        <>
          <SideHeading>My teams</SideHeading>
          {mine.map((s) => (
            <CheckRow
              key={s.id}
              color={s.color}
              on={!hidden.has(s.id)}
              onClick={() => setHidden(toggled(hidden, s.id))}
              badge={<span className="text-[11px]" title="Includes your team's private practices and meetings">🔒</span>}
            >
              {s.emoji} {s.name}
            </CheckRow>
          ))}
        </>
      )}

      {followed.length > 0 && (
        <>
          <SideHeading>Following</SideHeading>
          {followed.map((s) => (
            <CheckRow key={s.id} color={s.color} on={!hidden.has(s.id)} onClick={() => setHidden(toggled(hidden, s.id))}>
              {s.emoji} {s.name}
            </CheckRow>
          ))}
        </>
      )}

      <SideHeading
        action={
          hidden.size > 0 && (
            <button type="button" className="text-[11px] font-semibold text-signal" onClick={() => setHidden(new Set())}>
              Show all
            </button>
          )
        }
      >
        Calendars
      </SideHeading>
      <CheckRow color="var(--signal)" on={!hidden.has(GENERAL)} onClick={() => setHidden(toggled(hidden, GENERAL))}>
        GCS Athletics (general)
      </CheckRow>
      {others.map((s) => (
        <CheckRow key={s.id} color={s.color} on={!hidden.has(s.id)} onClick={() => setHidden(toggled(hidden, s.id))}>
          {s.emoji} {s.name}
        </CheckRow>
      ))}

      <details className="group mt-2" open={hiddenKinds.size > 0}>
        <summary className="mt-4 flex cursor-pointer list-none items-center justify-between rounded-lg px-2 py-1 text-[11px] font-bold uppercase tracking-[0.12em] muted hover:bg-surface-2">
          Event types
          <Chevron dir="down" className="size-3.5 transition group-open:rotate-180" />
        </summary>
        {EVENT_KINDS.map((k) => (
          <CheckRow key={k.id} color={k.color} on={!hiddenKinds.has(k.id)} onClick={() => setHiddenKinds(toggled(hiddenKinds, k.id))}>
            {k.label}
          </CheckRow>
        ))}
      </details>

      <button
        type="button"
        onClick={onSubscribe}
        className="mt-6 flex w-full items-center gap-3 rounded-2xl border border-[var(--line-strong)] bg-surface p-3 text-left transition hover:border-ink"
      >
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#4285F4]/12 text-lg" aria-hidden>
          📲
        </span>
        <span className="min-w-0">
          <span className="block text-sm font-semibold">Add to Google Calendar</span>
          <span className="block text-xs muted">Get these events, with reminders, in your own calendar app</span>
        </span>
      </button>

      <Deadlines onOpen={onOpen} />
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Schedule view                                                       */
/* ------------------------------------------------------------------ */

function Schedule({ from, today, events, onOpen }: { from: Date; today: Date; events: GEvent[]; onOpen: (e: GEvent) => void }) {
  const groups = new Map<string, GEvent[]>()
  for (const e of [...events].sort((a, b) => a.starts_at.localeCompare(b.starts_at))) {
    const start = new Date(e.starts_at)
    const k = dayKey(start < from ? from : start) // multi-day events that began earlier show on the first visible day
    groups.set(k, [...(groups.get(k) ?? []), e])
  }

  if (!groups.size) {
    return (
      <div className="card lanes px-6 py-16 text-center">
        <p className="display text-3xl">Nothing coming up</p>
        <p className="mt-2 text-sm muted">No events in the next three months match what’s showing. Check the calendars in the sidebar.</p>
      </div>
    )
  }

  let lastMonth = -1
  return (
    <div className="card divide-y divide-[var(--line)] overflow-hidden">
      {[...groups.entries()].map(([k, list]) => {
        const day = fromDayKey(k)
        const isToday = sameDay(day, today)
        const showMonth = day.getMonth() !== lastMonth
        lastMonth = day.getMonth()
        return (
          <div key={k}>
            {showMonth && (
              <p className="bg-surface-2/50 px-4 py-2 text-[11px] font-bold uppercase tracking-[0.14em] muted">
                {day.toLocaleString('en-US', { month: 'long', year: 'numeric' })}
              </p>
            )}
            <div className="flex gap-3 px-3 py-3 sm:gap-5 sm:px-4">
              <div className="flex w-12 shrink-0 flex-col items-center pt-0.5 sm:w-14">
                <span className={`grid size-10 place-items-center rounded-full text-xl font-semibold num ${isToday ? 'bg-signal text-white' : ''}`}>{day.getDate()}</span>
                <span className={`text-[10.5px] font-bold uppercase ${isToday ? 'text-signal' : 'muted'}`}>{fmtWeekday(day)}</span>
              </div>
              <div className="min-w-0 flex-1 divide-y divide-[var(--line)]">
                {list.map((e) => (
                  <EventRow key={e.id} event={e} onOpen={onOpen} />
                ))}
              </div>
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
        <span className={`block truncate font-semibold group-hover:text-signal ${e.cancelled ? 'line-through opacity-60' : ''}`}>
          {e.team_only && <span title="Team only">🔒 </span>}
          {e.title}
        </span>
        <span className="block truncate text-[13px] muted">
          {showDate && `${fmtDayLong(e.starts_at)} · `}
          {e.all_day ? 'All day' : fmtTime(e.starts_at)}
          {e.ends_at && !e.all_day && e.ends_at !== e.starts_at && sameDay(new Date(e.starts_at), new Date(e.ends_at)) ? ` – ${fmtTime(e.ends_at)}` : ''}
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

/* ------------------------------------------------------------------ */

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

  if (!soon.length) return null
  return (
    <section className="mt-6">
      <SideHeading>Closing soon</SideHeading>
      <ul className="space-y-1">
        {soon.map(({ e, at }) => {
          const sport = e.sport_id ? sportById.get(e.sport_id) : undefined
          const hours = (at.getTime() - now.getTime()) / 36e5
          return (
            <li key={e.id}>
              <button type="button" onClick={() => onOpen(e)} className="group flex w-full items-start gap-2.5 rounded-lg px-2 py-1.5 text-left hover:bg-surface-2">
                <span className={`num mt-0.5 shrink-0 rounded-md px-1.5 py-0.5 text-[10.5px] font-bold ${hours < 48 ? 'bg-signal text-white' : 'bg-surface-2'}`}>
                  {relative(at, now).replace('in ', '')}
                </span>
                <span className="min-w-0">
                  <span className="block text-[13px] font-semibold leading-snug group-hover:text-signal">{e.title}</span>
                  <span className="block text-[11.5px] muted">
                    {sport ? `${sport.name} · ` : ''}
                    {e.kind === 'deadline' ? 'Due' : 'Sign-ups close'} {at.toLocaleString('en-US', { month: 'short', day: 'numeric' })}
                  </span>
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
