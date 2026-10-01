/**
 * GET /ical/<token>.ics — a personal calendar feed that Google Calendar,
 * Apple Calendar and Outlook subscribe to.
 *
 * Runs as a Cloudflare Pages Function. It uses the same two environment
 * variables as the site (set in Pages → Settings → Variables and Secrets),
 * and only ever calls the calendar_feed() database function, which checks
 * the token and applies the site's visibility rules.
 */

interface Env {
  VITE_SUPABASE_URL: string
  VITE_SUPABASE_ANON_KEY: string
}

interface FeedEvent {
  id: string
  title: string
  kind: string
  sport: string | null
  starts_at: string
  ends_at: string | null
  all_day: boolean
  location: string | null
  opponent: string | null
  home_away: string | null
  description: string | null
  cancelled: boolean
  updated_at: string
}

const CRLF = '\r\n'

const esc = (t: string) =>
  t.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')

function fold(line: string) {
  if (line.length <= 74) return line
  const parts = [line.slice(0, 74)]
  for (let i = 74; i < line.length; i += 73) parts.push(` ${line.slice(i, i + 73)}`)
  return parts.join(CRLF)
}

const utc = (iso: string) => `${new Date(iso).toISOString().replace(/[-:]/g, '').split('.')[0]}Z`

/** All-day dates are calendar dates in Korea, not UTC. */
function kstDate(iso: string, addDays = 0) {
  const d = new Date(new Date(iso).getTime() + 9 * 36e5 + addDays * 864e5)
  return d.toISOString().slice(0, 10).replace(/-/g, '')
}

const KIND_LABEL: Record<string, string> = {
  game: 'Game',
  tournament: 'Tournament',
  tryout: 'Tryout',
  deadline: 'Deadline',
  practice: 'Practice',
  meeting: 'Meeting',
  other: 'Event',
}

function vevent(e: FeedEvent, origin: string) {
  const lines = ['BEGIN:VEVENT', `UID:${e.id}@gcs-athletics`, `DTSTAMP:${utc(e.updated_at)}`, `LAST-MODIFIED:${utc(e.updated_at)}`]
  if (e.all_day) {
    lines.push(`DTSTART;VALUE=DATE:${kstDate(e.starts_at)}`)
    lines.push(`DTEND;VALUE=DATE:${kstDate(e.ends_at ?? e.starts_at, 1)}`)
  } else {
    const end = e.ends_at ?? new Date(new Date(e.starts_at).getTime() + 36e5).toISOString()
    lines.push(`DTSTART:${utc(e.starts_at)}`, `DTEND:${utc(end)}`)
  }
  const title = [e.cancelled ? 'CANCELLED:' : '', e.sport ? `${e.sport} —` : '', e.title].filter(Boolean).join(' ')
  lines.push(`SUMMARY:${esc(title)}`)
  const vs = e.opponent ? `${e.home_away === 'away' ? '@' : 'vs'} ${e.opponent}` : ''
  const details = [KIND_LABEL[e.kind] ?? 'Event', vs, e.description ?? '', `${origin}/calendar?event=${e.id}`]
    .filter(Boolean)
    .join('\n\n')
  lines.push(`DESCRIPTION:${esc(details)}`)
  if (e.location) lines.push(`LOCATION:${esc(e.location)}`)
  lines.push(`URL:${origin}/calendar?event=${e.id}`)
  lines.push(`STATUS:${e.cancelled ? 'CANCELLED' : 'CONFIRMED'}`)
  lines.push('END:VEVENT')
  return lines
}

export const onRequestGet = async ({ params, env, request }: { params: { token: string | string[] }; env: Env; request: Request }) => {
  const raw = Array.isArray(params.token) ? params.token[0] : params.token
  const token = (raw ?? '').replace(/\.ics$/i, '')
  if (!/^[a-f0-9]{64}$/.test(token)) return new Response('Not found', { status: 404 })

  const res = await fetch(`${env.VITE_SUPABASE_URL}/rest/v1/rpc/calendar_feed`, {
    method: 'POST',
    headers: { apikey: env.VITE_SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_token: token }),
  })
  if (!res.ok) return new Response('Calendar temporarily unavailable', { status: 502 })

  const events = (await res.json()) as FeedEvent[] | null
  // Unknown or reset token: tell the calendar app it's gone.
  if (!events) return new Response('Not found', { status: 404 })

  const origin = new URL(request.url).origin
  const body = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//GCS Athletics//Calendar//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:GCS Athletics',
    'X-WR-CALDESC:Games\\, tryouts\\, deadlines and your team schedule from GCS Athletics',
    'X-WR-TIMEZONE:Asia/Seoul',
    // Hint to clients that honour it; Google refreshes on its own schedule.
    'REFRESH-INTERVAL;VALUE=DURATION:PT2H',
    'X-PUBLISHED-TTL:PT2H',
    ...events.flatMap((e) => vevent(e, origin)),
    'END:VCALENDAR',
  ]
    .map(fold)
    .join(CRLF)

  return new Response(body, {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Cache-Control': 'private, max-age=900',
    },
  })
}
