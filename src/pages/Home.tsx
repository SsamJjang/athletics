import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useData } from '../context/DataContext'
import { addDays, dayKey, fmtDate, fmtDayLong, fmtTime, fmtWeekday, relative, sameDay, startOfDay } from '../lib/dates'
import { fetchEvents } from '../lib/events'
import { plainText } from '../lib/markdown'
import { currentSeason, kindOf, seasonOf } from '../lib/meta'
import { isConfigured, supabase } from '../lib/supabase'
import type { Athlete, GEvent, Notice } from '../lib/types'
import { Scoreline } from '../components/EventDrawer'
import { SportCard } from './Sports'
import { Notice as Banner } from '../components/ui'

export default function Home() {
  const { session, profile, access } = useAuth()
  const { sports, sportById } = useData()
  const navigate = useNavigate()
  const [upcoming, setUpcoming] = useState<GEvent[]>([])
  const [recent, setRecent] = useState<GEvent[]>([])
  const [notices, setNotices] = useState<Notice[]>([])
  const [spotlight, setSpotlight] = useState<Athlete | null>(null)

  useEffect(() => {
    if (!isConfigured) return
    const now = new Date()
    void fetchEvents(startOfDay(now), addDays(now, 45)).then(setUpcoming).catch(() => {})
    void supabase
      .from('events')
      .select('*')
      .not('outcome', 'is', null)
      .lt('starts_at', now.toISOString())
      .order('starts_at', { ascending: false })
      .limit(12)
      .then(({ data }) => setRecent((data as GEvent[]) ?? []))
    void supabase
      .from('notices')
      .select('*')
      .eq('published', true)
      .order('pinned', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(4)
      .then(({ data }) => setNotices((data as Notice[]) ?? []))
  }, [access.is_community])

  useEffect(() => {
    if (!access.is_community) return setSpotlight(null)
    void supabase
      .from('athletes')
      .select('*')
      .eq('published', true)
      .order('featured', { ascending: false })
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => setSpotlight((data as Athlete) ?? null))
  }, [access.is_community])

  const now = new Date()
  const next = upcoming.find((e) => !e.cancelled && (e.kind === 'game' || e.kind === 'tournament') && new Date(e.ends_at ?? e.starts_at) > now)
  const season = currentSeason()
  const inSeason = sports.filter((s) => s.season === season && s.tier === 'team')
  const week = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(startOfDay(new Date()), i)), [])
  const open = (e: GEvent) => navigate(`/calendar?event=${e.id}&d=${dayKey(new Date(e.starts_at))}`)

  return (
    <div className="space-y-16">
      {profile?.kind === 'parent' && !access.is_verified_parent && !access.is_admin && (
        <Banner>
          <b>Your parent account isn’t verified yet.</b> Ask your child for a family code from their GCS account, then{' '}
          <Link to="/family" className="font-semibold text-signal underline underline-offset-2">
            enter it here
          </Link>
          .
        </Banner>
      )}

      {/* ---------------- Hero ---------------- */}
      <section className="stage rise relative overflow-hidden rounded-[28px] bg-ink text-paper">
        <div className="pointer-events-none absolute inset-0 opacity-[0.07]" style={{ backgroundImage: 'repeating-linear-gradient(90deg, #fff 0 1px, transparent 1px 96px)' }} aria-hidden />
        <div className="pointer-events-none absolute -right-24 top-0 hidden h-full w-2/3 -skew-x-12 bg-signal/90 lg:block" aria-hidden />
        <div className="pointer-events-none absolute -right-8 top-0 hidden h-full w-24 -skew-x-12 bg-volt lg:block" aria-hidden />
        {/* Narrow screens: the bands would sit behind the headline, so they become a kit stripe instead. */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex h-2.5 lg:hidden" aria-hidden>
          <span className="flex-[3] bg-signal" />
          <span className="flex-1 bg-volt" />
        </div>

        <div className="relative grid gap-10 p-7 sm:p-12 lg:grid-cols-[1.2fr_1fr] lg:items-end">
          <div>
            <p className="eyebrow !text-paper/60">Gaonnuri Christian School · {seasonOf(season).label} season</p>
            <h1 className="display mt-4 text-[clamp(3.6rem,10vw,8.5rem)] leading-[0.85]">
              Play
              <br />
              for <span className="text-volt">GCS.</span>
            </h1>
            <p className="mt-6 max-w-md text-paper/70">
              Every game, tryout and sign-up deadline in one place — plus every sport you can play here, and a few you might not know about.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link to="/calendar" className="btn btn-volt">
                Open the calendar
              </Link>
              <Link to="/sports" className="btn border-paper/25 text-paper hover:border-paper">
                Browse sports
              </Link>
            </div>
          </div>

          <NextUp event={next} onOpen={open} />
        </div>
      </section>

      {/* ---------------- Results ticker ---------------- */}
      {recent.length > 0 && (
        <section aria-label="Recent results" className="marquee -mx-4 overflow-hidden border-y-2 border-ink py-3 sm:-mx-6">
          <div className="marquee-track">
            {[0, 1].map((dup) => (
              <div key={dup} className="flex shrink-0" aria-hidden={dup === 1}>
                {recent.map((e) => {
                  const s = e.sport_id ? sportById.get(e.sport_id) : undefined
                  return (
                    <button key={e.id + dup} type="button" onClick={() => open(e)} className="flex items-center gap-3 px-6 text-sm font-semibold whitespace-nowrap">
                      <span className="display text-lg">{s?.emoji} {s?.name ?? e.title}</span>
                      {e.opponent && <span className="muted">vs {e.opponent}</span>}
                      <Scoreline event={e} />
                      <span className="text-signal">✦</span>
                    </button>
                  )
                })}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ---------------- This week ---------------- */}
      <section>
        <SectionTitle eyebrow="Next 7 days" title="This week" link={{ to: '/calendar?v=week', label: 'Full week' }} />
        <div className="scroll-x -mx-4 flex snap-x gap-3 px-4 sm:mx-0 sm:grid sm:grid-cols-7 sm:px-0">
          {week.map((day) => {
            const list = upcoming.filter((e) => sameDay(new Date(e.starts_at), day))
            const isToday = sameDay(day, new Date())
            return (
              <div key={dayKey(day)} className={`card min-h-44 w-40 shrink-0 snap-start p-3 sm:w-auto ${isToday ? 'bg-ink text-paper' : ''}`}>
                <p className={`eyebrow ${isToday ? '!text-volt' : ''}`}>{isToday ? 'Today' : fmtWeekday(day)}</p>
                <p className="display text-4xl">{day.getDate()}</p>
                <div className="mt-2 space-y-1.5">
                  {list.length === 0 && <p className={`text-xs ${isToday ? 'text-paper/50' : 'faint'}`}>Rest day</p>}
                  {list.slice(0, 3).map((e) => {
                    const color = (e.sport_id && sportById.get(e.sport_id)?.color) || kindOf(e.kind).color
                    return (
                      <button key={e.id} type="button" onClick={() => open(e)} className="block w-full border-l-[3px] pl-2 text-left text-[12.5px] leading-snug hover:opacity-80" style={{ borderColor: color }}>
                        <span className="block font-semibold line-clamp-2">{e.title}</span>
                        <span className={`num ${isToday ? 'text-paper/60' : 'muted'}`}>{e.all_day ? 'All day' : fmtTime(e.starts_at)}</span>
                      </button>
                    )
                  })}
                  {list.length > 3 && <p className="text-[11px] font-semibold opacity-60">+{list.length - 3} more</p>}
                </div>
              </div>
            )
          })}
        </div>
      </section>

      {/* ---------------- Notices + deadlines ---------------- */}
      <section className="grid gap-10 lg:grid-cols-[1.4fr_1fr]">
        <div>
          <SectionTitle eyebrow="From the ADs" title="Notices" link={{ to: '/notices', label: 'All notices' }} />
          {notices.length === 0 ? (
            <p className="card lanes p-8 text-center text-sm muted">No notices yet.</p>
          ) : (
            <div className="grid gap-3">
              {notices.map((n, i) => (
                <Link key={n.id} to={`/notices/${n.id}`} className={`card group flex gap-4 p-5 transition hover:-translate-y-0.5 ${i === 0 && n.cover_url ? 'sm:p-0 sm:overflow-hidden' : ''}`}>
                  {i === 0 && n.cover_url && <img src={n.cover_url} alt="" className="hidden w-48 shrink-0 object-cover sm:block" />}
                  <div className={`min-w-0 ${i === 0 && n.cover_url ? 'sm:py-5 sm:pr-5' : ''}`}>
                    <div className="flex items-center gap-2">
                      {n.pinned && <span className="tag bg-signal text-white">Pinned</span>}
                      <span className="text-xs faint">{fmtDate(n.created_at)}</span>
                    </div>
                    <h3 className="mt-1.5 text-lg font-bold leading-snug group-hover:text-signal">{n.title}</h3>
                    <p className="mt-1 text-sm muted line-clamp-2">{plainText(n.body, 200)}</p>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
        <div>
          <SectionTitle eyebrow="Don’t miss" title="Deadlines" />
          <DeadlineList events={upcoming} onOpen={open} />
        </div>
      </section>

      {/* ---------------- In season ---------------- */}
      {inSeason.length > 0 && (
        <section>
          <SectionTitle eyebrow={seasonOf(season).months} title={`In season: ${seasonOf(season).label}`} link={{ to: '/sports', label: 'Every sport' }} />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {inSeason.slice(0, 6).map((s) => (
              <SportCard key={s.id} sport={s} />
            ))}
          </div>
        </section>
      )}

      {/* ---------------- Athlete spotlight ---------------- */}
      <section>
        <SectionTitle eyebrow="Spotlight" title="Meet our athletes" link={{ to: '/athletes', label: 'All athletes' }} />
        {spotlight ? (
          <Link to={`/athletes/${spotlight.id}`} className="card group grid overflow-hidden sm:grid-cols-[280px_1fr]">
            <div className="relative aspect-[4/5] bg-surface-2 sm:aspect-auto">
              {spotlight.photo_url ? (
                <img src={spotlight.photo_url} alt="" className="absolute inset-0 size-full object-cover transition duration-500 group-hover:scale-[1.03]" />
              ) : (
                <div className="display absolute inset-0 grid place-items-center text-8xl text-ink/15">{spotlight.jersey || '★'}</div>
              )}
            </div>
            <div className="relative flex flex-col justify-center p-7 sm:p-10">
              {spotlight.jersey && <span className="display pointer-events-none absolute right-6 top-2 text-[9rem] leading-none text-ink/[0.05]">{spotlight.jersey}</span>}
              <p className="eyebrow">{spotlight.headline}</p>
              <h3 className="display mt-2 text-5xl">{spotlight.full_name}</h3>
              {spotlight.quote && <p className="mt-5 max-w-lg border-l-4 border-volt pl-4 text-lg italic">“{spotlight.quote}”</p>}
              <span className="mt-6 text-sm font-semibold text-signal">Read their story →</span>
            </div>
          </Link>
        ) : (
          <div className="card lanes flex flex-col items-start gap-4 p-8 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="display text-3xl">{access.is_community ? 'Spotlights coming soon' : 'For the GCS community'}</p>
              <p className="mt-1 max-w-md text-sm muted">
                {access.is_community
                  ? 'The ADs are writing the first athlete features.'
                  : 'Athlete profiles are visible to GCS students and verified parents.'}
              </p>
            </div>
            {!session && (
              <Link to="/login" className="btn btn-ink">
                Sign in
              </Link>
            )}
          </div>
        )}
      </section>
    </div>
  )
}

function SectionTitle({ eyebrow, title, link }: { eyebrow: string; title: string; link?: { to: string; label: string } }) {
  return (
    <div className="mb-5 flex items-end justify-between gap-4">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h2 className="display mt-1 text-4xl">{title}</h2>
      </div>
      {link && (
        <Link to={link.to} className="shrink-0 text-sm font-semibold text-signal hover:underline">
          {link.label} →
        </Link>
      )}
    </div>
  )
}

/** A stadium scoreboard counting down to the next game. */
function NextUp({ event, onOpen }: { event: GEvent | undefined; onOpen: (e: GEvent) => void }) {
  const { sportById } = useData()
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(t)
  }, [])

  if (!event) {
    return (
      <div className="rounded-2xl border border-paper/15 bg-black/40 p-6 backdrop-blur">
        <p className="eyebrow !text-paper/60">Next up</p>
        <p className="display mt-3 text-4xl">Schedule coming soon</p>
        <p className="mt-2 text-sm text-paper/60">Games appear here as the ADs add them.</p>
      </div>
    )
  }

  const sport = event.sport_id ? sportById.get(event.sport_id) : undefined
  const ms = Math.max(0, new Date(event.starts_at).getTime() - now)
  const live = ms === 0
  const parts = [
    ['Days', Math.floor(ms / 864e5)],
    ['Hrs', Math.floor(ms / 36e5) % 24],
    ['Min', Math.floor(ms / 6e4) % 60],
    ['Sec', Math.floor(ms / 1e3) % 60],
  ] as const

  return (
    <button type="button" onClick={() => onOpen(event)} className="group rounded-2xl border border-paper/15 bg-black/55 p-6 text-left backdrop-blur transition hover:border-volt">
      <div className="flex items-center justify-between">
        <p className="eyebrow !text-paper/60">{live ? 'Happening now' : 'Next up'}</p>
        {live && <span className="size-2.5 animate-pulse rounded-full bg-volt" />}
      </div>
      <p className="mt-3 text-sm font-semibold text-paper/70">
        {sport?.emoji} {sport?.name}
      </p>
      <p className="display mt-1 text-3xl leading-tight group-hover:text-volt">
        {event.opponent ? (
          <>
            GCS <span className="text-paper/50">{event.home_away === 'away' ? '@' : 'vs'}</span> {event.opponent}
          </>
        ) : (
          event.title
        )}
      </p>
      {!live && (
        <div className="mt-5 grid grid-cols-4 gap-2">
          {parts.map(([label, n]) => (
            <div key={label} className="rounded-lg bg-black/60 py-2 text-center ring-1 ring-paper/10">
              <div className="num font-mono text-3xl font-bold text-volt">{String(n).padStart(2, '0')}</div>
              <div className="text-[10px] font-bold uppercase tracking-widest text-paper/50">{label}</div>
            </div>
          ))}
        </div>
      )}
      <p className="mt-4 text-sm text-paper/70">
        {fmtDayLong(event.starts_at)} · {fmtTime(event.starts_at)}
        {event.location && ` · ${event.location}`}
      </p>
    </button>
  )
}

function DeadlineList({ events, onOpen }: { events: GEvent[]; onOpen: (e: GEvent) => void }) {
  const { sportById } = useData()
  const now = new Date()
  const list = events
    .filter((e) => !e.cancelled && (e.kind === 'deadline' || e.kind === 'tryout' || e.signup_enabled))
    .map((e) => ({ e, at: new Date(e.kind === 'deadline' ? e.starts_at : (e.signup_deadline ?? e.starts_at)) }))
    .filter((x) => x.at > now)
    .sort((a, b) => a.at.getTime() - b.at.getTime())
    .slice(0, 5)

  if (!list.length) return <p className="card lanes p-8 text-center text-sm muted">Nothing due right now.</p>

  return (
    <ol className="card divide-y divide-[var(--line)]">
      {list.map(({ e, at }) => {
        const s = e.sport_id ? sportById.get(e.sport_id) : undefined
        const urgent = at.getTime() - now.getTime() < 3 * 864e5
        return (
          <li key={e.id}>
            <button type="button" onClick={() => onOpen(e)} className="group flex w-full items-center gap-4 p-4 text-left">
              <div className={`grid w-14 shrink-0 place-items-center rounded-xl py-1.5 ${urgent ? 'bg-signal text-white' : 'bg-surface-2'}`}>
                <span className="text-[10px] font-bold uppercase">{at.toLocaleString('en-US', { month: 'short' })}</span>
                <span className="display text-2xl leading-none">{at.getDate()}</span>
              </div>
              <div className="min-w-0">
                <p className="font-semibold leading-snug group-hover:text-signal">{e.title}</p>
                <p className="text-xs muted">
                  {s ? `${s.emoji} ${s.name} · ` : ''}
                  {kindOf(e.kind).label} · {relative(at)}
                </p>
              </div>
            </button>
          </li>
        )
      })}
    </ol>
  )
}
