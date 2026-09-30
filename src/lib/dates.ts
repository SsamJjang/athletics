/** Local-calendar helpers. The whole school lives in one time zone (KST). */

export function startOfDay(d: Date) {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}

export function addDays(d: Date, n: number) {
  const x = new Date(d)
  x.setDate(x.getDate() + n)
  return x
}

export function addMonths(d: Date, n: number) {
  const x = new Date(d.getFullYear(), d.getMonth() + n, 1)
  return x
}

export function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

export function dayKey(d: Date) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function fromDayKey(key: string) {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, (m ?? 1) - 1, d ?? 1)
}

/** Sunday-first weeks covering the whole month: always 6 rows, so the grid never jumps. */
export function monthGrid(anchor: Date) {
  const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1)
  const start = addDays(first, -first.getDay())
  return Array.from({ length: 42 }, (_, i) => addDays(start, i))
}

export function weekDays(anchor: Date) {
  const start = addDays(startOfDay(anchor), -anchor.getDay())
  return Array.from({ length: 7 }, (_, i) => addDays(start, i))
}

const fmt = (opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('en-US', opts)
const F = {
  time: fmt({ hour: 'numeric', minute: '2-digit' }),
  day: fmt({ weekday: 'short', month: 'short', day: 'numeric' }),
  dayLong: fmt({ weekday: 'long', month: 'long', day: 'numeric' }),
  month: fmt({ month: 'long', year: 'numeric' }),
  monthShort: fmt({ month: 'short' }),
  weekday: fmt({ weekday: 'short' }),
  date: fmt({ month: 'short', day: 'numeric', year: 'numeric' }),
}

export function fmtTime(d: Date | string) {
  return F.time.format(new Date(d)).replace(':00', '').replace(/\s/g, '').toLowerCase()
}
export const fmtDay = (d: Date | string) => F.day.format(new Date(d))
export const fmtDayLong = (d: Date | string) => F.dayLong.format(new Date(d))
export const fmtMonth = (d: Date) => F.month.format(d)
export const fmtMonthShort = (d: Date | string) => F.monthShort.format(new Date(d))
export const fmtWeekday = (d: Date | string) => F.weekday.format(new Date(d))
export const fmtDate = (d: Date | string) => F.date.format(new Date(d))

export function fmtRange(startIso: string, endIso: string | null, allDay: boolean) {
  const start = new Date(startIso)
  if (allDay) {
    if (endIso && !sameDay(start, new Date(endIso))) return `${fmtDay(start)} – ${fmtDay(endIso)}`
    return `${fmtDayLong(start)} · All day`
  }
  if (!endIso) return `${fmtDayLong(start)} · ${fmtTime(start)}`
  const end = new Date(endIso)
  if (sameDay(start, end)) return `${fmtDayLong(start)} · ${fmtTime(start)} – ${fmtTime(end)}`
  return `${fmtDay(start)} ${fmtTime(start)} – ${fmtDay(end)} ${fmtTime(end)}`
}

/** "in 3 days", "tomorrow", "2 hours ago" */
export function relative(target: Date | string, now = new Date()) {
  const t = new Date(target)
  const diff = t.getTime() - now.getTime()
  const abs = Math.abs(diff)
  const past = diff < 0
  const mins = Math.round(abs / 6e4)
  const hours = Math.round(abs / 36e5)
  const days = Math.round((startOfDay(t).getTime() - startOfDay(now).getTime()) / 864e5)

  if (mins < 1) return 'now'
  if (mins < 60) return past ? `${mins} min ago` : `in ${mins} min`
  if (hours < 20 && days === 0) return past ? `${hours}h ago` : `in ${hours}h`
  if (days === 1) return 'tomorrow'
  if (days === -1) return 'yesterday'
  if (Math.abs(days) < 14) return past ? `${-days} days ago` : `in ${days} days`
  const weeks = Math.round(Math.abs(days) / 7)
  if (weeks < 9) return past ? `${weeks} weeks ago` : `in ${weeks} weeks`
  return fmtDate(t)
}

/** ISO string → value for <input type="datetime-local"> in local time. */
export function toLocalInput(iso: string | null | undefined) {
  if (!iso) return ''
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function fromLocalInput(value: string) {
  return value ? new Date(value).toISOString() : null
}

/** Does an event touch this calendar day? Multi-day events span cells. */
export function coversDay(startIso: string, endIso: string | null, day: Date) {
  const start = startOfDay(new Date(startIso))
  const end = startOfDay(new Date(endIso ?? startIso))
  const d = startOfDay(day)
  return d >= start && d <= end
}
