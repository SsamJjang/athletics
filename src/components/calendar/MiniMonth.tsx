import { useEffect, useState } from 'react'
import { addMonths, dayKey, fmtMonth, monthGrid, sameDay } from '../../lib/dates'
import { Chevron } from '../ui'

/** The small month in the sidebar: jump to any date. Dots mark days with events. */
export default function MiniMonth({
  selected,
  today,
  busyDays,
  onPick,
}: {
  selected: Date
  today: Date
  busyDays: Set<string>
  onPick: (d: Date) => void
}) {
  // Browsing the mini month doesn't move the main view until a day is picked.
  const [anchor, setAnchor] = useState(() => new Date(selected.getFullYear(), selected.getMonth(), 1))
  useEffect(() => {
    setAnchor(new Date(selected.getFullYear(), selected.getMonth(), 1))
  }, [selected.getFullYear(), selected.getMonth()]) // eslint-disable-line react-hooks/exhaustive-deps

  const grid = monthGrid(anchor)
  return (
    <div className="select-none">
      <div className="mb-2 flex items-center justify-between pl-1">
        <span className="text-sm font-bold">{fmtMonth(anchor)}</span>
        <span className="flex">
          <button type="button" className="icon-btn !size-7" onClick={() => setAnchor((a) => addMonths(a, -1))} aria-label="Previous month">
            <Chevron dir="left" className="size-3.5" />
          </button>
          <button type="button" className="icon-btn !size-7" onClick={() => setAnchor((a) => addMonths(a, 1))} aria-label="Next month">
            <Chevron dir="right" className="size-3.5" />
          </button>
        </span>
      </div>
      <div className="grid grid-cols-7 text-center text-[10.5px] font-bold faint">
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
          <span key={i} className="py-1">
            {d}
          </span>
        ))}
      </div>
      <div className="grid grid-cols-7 text-center text-[12px]">
        {grid.map((d) => {
          const isToday = sameDay(d, today)
          const isSel = sameDay(d, selected)
          const outside = d.getMonth() !== anchor.getMonth()
          return (
            <button
              key={dayKey(d)}
              type="button"
              onClick={() => onPick(d)}
              className={`relative mx-auto my-[1px] grid size-7 place-items-center rounded-full font-semibold num transition ${
                isToday ? 'bg-signal text-white' : isSel ? 'bg-[var(--signal-soft)] text-signal' : outside ? 'faint hover:bg-surface-2' : 'hover:bg-surface-2'
              }`}
              aria-label={d.toDateString()}
              aria-current={isToday ? 'date' : undefined}
            >
              {d.getDate()}
              {busyDays.has(dayKey(d)) && !isToday && (
                <span className="absolute bottom-[3px] left-1/2 size-[3px] -translate-x-1/2 rounded-full bg-signal" aria-hidden />
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
