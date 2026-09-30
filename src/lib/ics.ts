import type { GEvent, Sport } from './types'
import { kindOf } from './meta'
import { addDays, dayKey } from './dates'

/**
 * iCalendar export, so the athletics calendar can live in the calendar
 * people already check — Google, Outlook, Apple all read .ics.
 */

const CRLF = '\r\n'

const esc = (t: string) =>
  t.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')

function fold(line: string) {
  if (line.length <= 74) return line
  const parts = [line.slice(0, 74)]
  for (let i = 74; i < line.length; i += 73) parts.push(` ${line.slice(i, i + 73)}`)
  return parts.join(CRLF)
}

const utc = (d: Date) => `${d.toISOString().replace(/[-:]/g, '').split('.')[0]}Z`
const plainDate = (d: Date) => dayKey(d).replace(/-/g, '')

function vevent(e: GEvent, sport: Sport | undefined) {
  const start = new Date(e.starts_at)
  const end = e.ends_at ? new Date(e.ends_at) : new Date(start.getTime() + 36e5)
  const lines = ['BEGIN:VEVENT', `UID:${e.id}@gcs-athletics`, `DTSTAMP:${utc(new Date())}`]

  if (e.all_day) {
    lines.push(`DTSTART;VALUE=DATE:${plainDate(start)}`)
    lines.push(`DTEND;VALUE=DATE:${plainDate(addDays(e.ends_at ? end : start, 1))}`)
  } else {
    lines.push(`DTSTART:${utc(start)}`, `DTEND:${utc(end)}`)
  }

  const title = [e.cancelled ? 'CANCELLED:' : '', sport?.name ? `${sport.name} —` : '', e.title]
    .filter(Boolean)
    .join(' ')
  lines.push(`SUMMARY:${esc(title)}`)
  const details = [kindOf(e.kind).label, e.opponent ? `vs ${e.opponent}` : '', e.description]
    .filter(Boolean)
    .join('\n\n')
  if (details) lines.push(`DESCRIPTION:${esc(details)}`)
  if (e.location) lines.push(`LOCATION:${esc(e.location)}`)
  lines.push(`URL:${window.location.origin}/calendar?event=${e.id}`)
  if (e.cancelled) lines.push('STATUS:CANCELLED')
  lines.push('END:VEVENT')
  return lines
}

export function buildIcs(events: GEvent[], sports: Map<string, Sport>, name = 'GCS Athletics') {
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//GCS Athletics//Calendar//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${esc(name)}`,
    'X-WR-TIMEZONE:Asia/Seoul',
    ...events.flatMap((e) => vevent(e, e.sport_id ? sports.get(e.sport_id) : undefined)),
    'END:VCALENDAR',
  ]
    .map(fold)
    .join(CRLF)
}

export function downloadIcs(filename: string, contents: string) {
  const blob = new Blob([contents], { type: 'text/calendar;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename.endsWith('.ics') ? filename : `${filename}.ics`
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function googleCalendarUrl(e: GEvent, sport?: Sport) {
  const start = new Date(e.starts_at)
  const end = e.ends_at ? new Date(e.ends_at) : new Date(start.getTime() + 36e5)
  const stamp = (d: Date) => d.toISOString().replace(/[-:]|\.\d{3}/g, '')
  const dates = e.all_day
    ? `${plainDate(start)}/${plainDate(addDays(e.ends_at ? end : start, 1))}`
    : `${stamp(start)}/${stamp(end)}`
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: sport ? `${sport.name} — ${e.title}` : e.title,
    dates,
    details: e.description ?? '',
    location: e.location ?? '',
  })
  return `https://calendar.google.com/calendar/render?${params}`
}
