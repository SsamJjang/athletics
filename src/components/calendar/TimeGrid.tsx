import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { coversDay, dayKey, fmtTime, sameDay, startOfDay } from '../../lib/dates'
import { textOn } from '../../lib/meta'
import type { GEvent } from '../../lib/types'

const HOUR = 48 // px per hour
const MIN_BLOCK = 22 // px — a deadline or 15-minute meeting still needs room for its title

interface Placed {
  event: GEvent
  top: number
  height: number
  col: number
  cols: number
}

/** Events that sit in the hour grid: timed, and starting and ending on the same day. */
function isTimed(e: GEvent) {
  if (e.all_day) return false
  const s = new Date(e.starts_at)
  const end = new Date(e.ends_at ?? e.starts_at)
  return sameDay(s, end) || end.getTime() - s.getTime() <= 0
}

/**
 * Overlapping events share the column width, Google-style: each cluster of
 * mutually overlapping events is split into as many lanes as it needs.
 */
function layout(events: GEvent[], day: Date): Placed[] {
  const dayStart = startOfDay(day).getTime()
  const items = events
    .map((event) => {
      const s = new Date(event.starts_at).getTime()
      const e = event.ends_at ? new Date(event.ends_at).getTime() : s
      const top = ((s - dayStart) / 36e5) * HOUR
      const height = Math.max(((e - s) / 36e5) * HOUR, MIN_BLOCK)
      return { event, top, height, bottom: top + height, col: 0, cols: 1 }
    })
    .sort((a, b) => a.top - b.top || b.height - a.height)

  let cluster: typeof items = []
  let clusterEnd = -1
  const flush = () => {
    const lanes: number[] = [] // bottom of the last item in each lane
    for (const it of cluster) {
      let lane = lanes.findIndex((bottom) => bottom <= it.top)
      if (lane === -1) {
        lane = lanes.length
        lanes.push(it.bottom)
      } else lanes[lane] = it.bottom
      it.col = lane
    }
    for (const it of cluster) it.cols = lanes.length
    cluster = []
  }
  for (const it of items) {
    if (it.top >= clusterEnd) {
      flush()
      clusterEnd = it.bottom
    } else clusterEnd = Math.max(clusterEnd, it.bottom)
    cluster.push(it)
  }
  flush()
  return items
}

function hourLabel(h: number) {
  if (h === 0) return ''
  const suffix = h < 12 ? 'AM' : 'PM'
  const n = h % 12 === 0 ? 12 : h % 12
  return `${n} ${suffix}`
}

export default function TimeGrid({
  days,
  events,
  today,
  colorOf,
  onOpen,
  onPickDay,
  onCreateAt,
}: {
  days: Date[]
  events: GEvent[]
  today: Date
  colorOf: (e: GEvent) => string
  onOpen: (e: GEvent) => void
  onPickDay: (d: Date) => void
  /** Admins: clicking an empty slot starts a new event there. */
  onCreateAt?: (at: Date) => void
}) {
  const scroller = useRef<HTMLDivElement>(null)
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 60_000)
    return () => window.clearInterval(t)
  }, [])

  const perDay = useMemo(
    () =>
      days.map((d) => {
        const covering = events.filter((e) => coversDay(e.starts_at, e.ends_at, d))
        return {
          day: d,
          allDay: covering.filter((e) => !isTimed(e)),
          placed: layout(
            covering.filter(isTimed),
            d,
          ),
        }
      }),
    [days, events],
  )

  // Like Google: looking at today, put "now" a third of the way down;
  // otherwise open on the morning, or earlier if something starts earlier.
  const firstKey = dayKey(days[0])
  useLayoutEffect(() => {
    const el = scroller.current
    if (!el) return
    if (days.some((d) => sameDay(d, today))) {
      const nowTop = ((Date.now() - startOfDay(new Date()).getTime()) / 36e5) * HOUR
      el.scrollTo({ top: Math.max(0, nowTop - el.clientHeight / 3) })
      return
    }
    const earliest = Math.min(7 * HOUR, ...perDay.flatMap((d) => d.placed.map((p) => p.top)))
    el.scrollTo({ top: Math.max(0, earliest - HOUR / 2) })
  }, [firstKey, days.length]) // eslint-disable-line react-hooks/exhaustive-deps

  const hasAllDay = perDay.some((d) => d.allDay.length > 0)
  const cols = `56px repeat(${days.length}, minmax(0, 1fr))`

  return (
    <div className="card flex flex-col overflow-hidden">
      {/* Day headers */}
      <div className="grid border-b hairline" style={{ gridTemplateColumns: cols }}>
        <div />
        {days.map((d) => {
          const isToday = sameDay(d, today)
          return (
            <button key={dayKey(d)} type="button" onClick={() => onPickDay(d)} className="group flex flex-col items-center gap-1 py-2.5">
              <span className={`text-[11px] font-bold uppercase tracking-wider ${isToday ? 'text-signal' : 'muted'}`}>
                {d.toLocaleString('en-US', { weekday: 'short' })}
              </span>
              <span
                className={`grid size-10 place-items-center rounded-full text-xl font-semibold num transition ${
                  isToday ? 'bg-signal text-white' : 'group-hover:bg-surface-2'
                }`}
              >
                {d.getDate()}
              </span>
            </button>
          )
        })}
      </div>

      {/* All-day strip */}
      {hasAllDay && (
        <div className="grid border-b hairline" style={{ gridTemplateColumns: cols }}>
          <div className="py-1.5 pr-2 text-right text-[10px] font-semibold uppercase faint">All day</div>
          {perDay.map(({ day, allDay }) => (
            <div key={dayKey(day)} className="flex min-w-0 flex-col gap-0.5 border-l hairline p-1">
              {allDay.map((e) => (
                <button
                  key={e.id}
                  type="button"
                  onClick={() => onOpen(e)}
                  className={`truncate rounded-md px-1.5 py-0.5 text-left text-[12px] font-semibold ${e.cancelled ? 'line-through opacity-60' : ''}`}
                  style={{ background: colorOf(e), color: textOn(colorOf(e)) }}
                  title={e.title}
                >
                  {e.team_only && '🔒 '}
                  {e.title}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}

      {/* Hours */}
      <div ref={scroller} className="relative max-h-[calc(100dvh-280px)] min-h-[420px] overflow-y-auto">
        <div className="grid" style={{ gridTemplateColumns: cols, height: HOUR * 24 }}>
          {/* Hour labels */}
          <div className="relative">
            {Array.from({ length: 24 }, (_, h) => (
              <span key={h} className="absolute right-2 -translate-y-1/2 text-[10.5px] font-medium faint num" style={{ top: h * HOUR }}>
                {hourLabel(h)}
              </span>
            ))}
          </div>

          {perDay.map(({ day, placed }) => {
            const isToday = sameDay(day, today)
            const nowTop = ((now.getTime() - startOfDay(day).getTime()) / 36e5) * HOUR
            return (
              <div
                key={dayKey(day)}
                className={`relative border-l hairline ${onCreateAt ? 'cursor-cell' : ''}`}
                style={{
                  backgroundImage: 'linear-gradient(to bottom, var(--line) 1px, transparent 1px)',
                  backgroundSize: `100% ${HOUR}px`,
                }}
                onClick={(ev) => {
                  if (!onCreateAt || ev.target !== ev.currentTarget) return
                  const y = ev.nativeEvent.offsetY
                  const minutes = Math.floor((y / HOUR) * 2) * 30 // snap to the half hour
                  const at = startOfDay(day)
                  at.setMinutes(minutes)
                  onCreateAt(at)
                }}
              >
                {placed.map((p) => {
                  const e = p.event
                  const color = colorOf(e)
                  const short = p.height < 40
                  return (
                    <button
                      key={e.id}
                      type="button"
                      onClick={() => onOpen(e)}
                      title={`${e.title} · ${fmtTime(e.starts_at)}`}
                      className={`absolute overflow-hidden rounded-md border border-[var(--surface)] px-1.5 text-left shadow-sm transition hover:z-10 hover:brightness-110 ${
                        e.cancelled ? 'opacity-55' : ''
                      } ${short ? 'flex items-center gap-1 py-0' : 'py-1'}`}
                      style={{
                        top: p.top,
                        height: p.height,
                        left: `calc(${(p.col / p.cols) * 100}% + 2px)`,
                        width: `calc(${100 / p.cols}% - 4px)`,
                        color: textOn(color),
                        background: e.kind === 'deadline' ? `repeating-linear-gradient(-45deg, ${color} 0 6px, color-mix(in oklab, ${color} 82%, black) 6px 12px)` : color,
                      }}
                    >
                      <span className={`block truncate text-[12px] font-semibold leading-tight ${e.cancelled ? 'line-through' : ''}`}>
                        {e.kind === 'deadline' && '⏱ '}
                        {e.team_only && '🔒 '}
                        {e.title}
                      </span>
                      <span className={`truncate text-[11px] leading-tight opacity-85 num ${short ? '' : 'block'}`}>
                        {fmtTime(e.starts_at)}
                        {e.ends_at && e.ends_at !== e.starts_at && !short ? ` – ${fmtTime(e.ends_at)}` : ''}
                        {!short && e.location ? ` · ${e.location}` : ''}
                      </span>
                    </button>
                  )
                })}

                {isToday && nowTop >= 0 && nowTop <= HOUR * 24 && (
                  <div className="pointer-events-none absolute inset-x-0 z-20" style={{ top: nowTop }} aria-hidden>
                    <span className="absolute -left-[5px] -top-[5px] size-2.5 rounded-full bg-signal" />
                    <span className="block h-0.5 bg-signal" />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
