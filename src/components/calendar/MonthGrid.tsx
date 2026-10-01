import { dayKey, fmtMonth, fmtTime, sameDay } from '../../lib/dates'
import { textOn } from '../../lib/meta'
import type { GEvent } from '../../lib/types'

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MAX_CHIPS = 3

/**
 * Month view, Google-style: all-day and multi-day events are solid bars,
 * timed events are a dot + time + title. "N more" opens that day.
 */
export default function MonthGrid({
  grid,
  anchor,
  today,
  byDay,
  colorOf,
  onOpen,
  onPickDay,
}: {
  grid: Date[]
  anchor: Date
  today: Date
  byDay: Map<string, GEvent[]>
  colorOf: (e: GEvent) => string
  onOpen: (e: GEvent) => void
  onPickDay: (d: Date) => void
}) {
  // Only show a 6th row when the month actually reaches into it.
  const rows = grid.slice(35).some((d) => d.getMonth() === anchor.getMonth()) ? 6 : 5
  const cells = grid.slice(0, rows * 7)

  return (
    <div className="card flex flex-col overflow-hidden">
      <div className="grid grid-cols-7 border-b hairline">
        {WEEKDAYS.map((w, i) => (
          <div key={w} className={`py-2 text-center text-[11px] font-bold uppercase tracking-wider ${i === 0 ? 'text-signal' : 'muted'}`}>
            {w}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7" role="grid" aria-label={fmtMonth(anchor)}>
        {cells.map((day, idx) => {
          const list = byDay.get(dayKey(day)) ?? []
          const outside = day.getMonth() !== anchor.getMonth()
          const isToday = sameDay(day, today)
          const shown = list.slice(0, list.length > MAX_CHIPS ? MAX_CHIPS - 1 : MAX_CHIPS)
          const more = list.length - shown.length
          return (
            <div
              key={idx}
              role="gridcell"
              aria-label={`${day.toDateString()}, ${list.length} ${list.length === 1 ? 'event' : 'events'}`}
              onClick={() => onPickDay(day)}
              className={`flex min-h-[64px] cursor-pointer flex-col gap-[2px] border-b border-r hairline px-1 pb-1 pt-1 transition-colors hover:bg-surface-2/40 sm:min-h-[112px] ${
                idx % 7 === 6 ? '!border-r-0' : ''
              } ${idx >= (rows - 1) * 7 ? '!border-b-0' : ''} ${outside ? 'bg-surface-2/30' : ''}`}
            >
              <span
                className={`mx-auto mb-0.5 grid size-7 place-items-center rounded-full text-[12.5px] font-semibold num ${
                  isToday ? 'bg-signal text-white' : outside ? 'faint' : ''
                }`}
              >
                {day.getDate() === 1 && !isToday ? `${day.toLocaleString('en-US', { month: 'short' })} 1` : day.getDate()}
              </span>

              {/* Phones: colored dots only. */}
              <div className="flex flex-wrap justify-center gap-[3px] sm:hidden">
                {list.slice(0, 4).map((e) => (
                  <span key={e.id} className="size-1.5 rounded-full" style={{ background: colorOf(e) }} />
                ))}
              </div>

              <div className="hidden min-w-0 flex-col gap-[2px] sm:flex">
                {shown.map((e) => {
                  const color = colorOf(e)
                  const bar = e.all_day || !sameDay(new Date(e.starts_at), new Date(e.ends_at ?? e.starts_at))
                  return (
                    <button
                      key={e.id}
                      type="button"
                      title={e.title}
                      onClick={(ev) => {
                        ev.stopPropagation()
                        onOpen(e)
                      }}
                      className={`flex min-w-0 items-center gap-1 rounded-[5px] px-1.5 py-[1px] text-left text-[12px] leading-[18px] transition ${
                        bar ? 'font-semibold hover:brightness-110' : 'hover:bg-surface-2'
                      } ${e.cancelled ? 'line-through opacity-55' : ''}`}
                      style={bar ? { background: color, color: textOn(color) } : undefined}
                    >
                      {!bar && <span className="size-2 shrink-0 rounded-full" style={{ background: color }} />}
                      {!bar && <span className="shrink-0 muted num">{fmtTime(e.starts_at)}</span>}
                      <span className={`truncate ${bar ? '' : 'font-semibold'}`}>
                        {e.kind === 'deadline' && '⏱ '}
                        {e.team_only && '🔒 '}
                        {e.title}
                      </span>
                    </button>
                  )
                })}
                {more > 0 && (
                  <span className="rounded-[5px] px-1.5 text-[11.5px] font-bold muted hover:bg-surface-2">{more} more</span>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
