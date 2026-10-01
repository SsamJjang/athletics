import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useData } from '../context/DataContext'
import { dayKey, fmtDate } from '../lib/dates'
import { plainText } from '../lib/markdown'
import { seasonOf } from '../lib/meta'
import { isConfigured, supabase } from '../lib/supabase'
import type { Athlete, GEvent, Notice } from '../lib/types'
import SportForm from '../components/admin/SportForm'
import { EmptyState, Markdown, Spinner, useToast } from '../components/ui'
import { EventRow } from './Calendar'

export default function SportDetail() {
  const { slug } = useParams()
  const { access } = useAuth()
  const { sports, sportsLoading, follows, toggleFollow, reloadSports } = useData()
  const navigate = useNavigate()
  const toast = useToast()
  const sport = sports.find((s) => s.slug === slug)
  const [events, setEvents] = useState<GEvent[]>([])
  const [notices, setNotices] = useState<Notice[]>([])
  const [athletes, setAthletes] = useState<Athlete[]>([])
  const [editing, setEditing] = useState(false)

  useEffect(() => {
    if (!sport || !isConfigured) return
    // School year starts in August: count the record from then.
    const now = new Date()
    const yearStart = new Date(now.getMonth() >= 7 ? now.getFullYear() : now.getFullYear() - 1, 7, 1)
    void supabase
      .from('events')
      .select('*')
      .eq('sport_id', sport.id)
      .gte('starts_at', yearStart.toISOString())
      .order('starts_at')
      .then(({ data }) => setEvents((data as GEvent[]) ?? []))
    void supabase
      .from('notices')
      .select('*')
      .eq('sport_id', sport.id)
      .eq('published', true)
      .order('created_at', { ascending: false })
      .limit(3)
      .then(({ data }) => setNotices((data as Notice[]) ?? []))
    if (access.is_community) {
      void supabase
        .from('athletes')
        .select('*')
        .contains('sport_ids', [sport.id])
        .eq('published', true)
        .order('sort_order')
        .then(({ data }) => setAthletes((data as Athlete[]) ?? []))
    }
  }, [sport, access.is_community])

  const now = new Date()
  const upcoming = events.filter((e) => new Date(e.ends_at ?? e.starts_at) >= now)
  const results = events.filter((e) => e.outcome).reverse()
  const record = useMemo(() => {
    const r = { win: 0, loss: 0, draw: 0 }
    for (const e of events) if (e.outcome) r[e.outcome]++
    return r
  }, [events])

  if (sportsLoading) return <Spinner />
  if (!sport) {
    return (
      <EmptyState icon="🧭" title="Sport not found" action={<Link to="/sports" className="btn btn-ink">All sports</Link>}>
        That sport doesn’t exist or isn’t active.
      </EmptyState>
    )
  }

  const season = seasonOf(sport.season)
  const following = follows.has(sport.id)
  const open = (e: GEvent) => navigate(`/calendar?event=${e.id}&d=${dayKey(new Date(e.starts_at))}`)
  const played = record.win + record.loss + record.draw

  return (
    <div className="rise">
      <Link to="/sports" className="text-sm font-semibold muted hover:text-ink">
        ← All sports
      </Link>

      {/* Hero */}
      <section className="relative mt-4 overflow-hidden rounded-[28px] text-white" style={{ background: sport.color }}>
        {sport.cover_url && <img src={sport.cover_url} alt="" className="absolute inset-0 size-full object-cover" />}
        <div className="absolute inset-0" style={{ background: sport.cover_url ? 'linear-gradient(90deg, rgb(0 0 0 / .75), rgb(0 0 0 / .15))' : undefined }} />
        {!sport.cover_url && <div className="stripes absolute inset-0 text-white/10" aria-hidden />}
        {!sport.cover_url && (
          <span className="pointer-events-none absolute -bottom-10 right-4 text-[14rem] leading-none drop-shadow-2xl sm:right-12" aria-hidden>
            {sport.emoji}
          </span>
        )}
        <div className="relative p-7 sm:p-12">
          <div className="flex flex-wrap gap-2">
            <span className="tag bg-black/40 text-white">{season.label} · {season.months}</span>
            {sport.tier === 'opportunity' && <span className="tag gold-fill">Opportunity</span>}
            {!sport.active && <span className="tag bg-white text-black">Hidden</span>}
          </div>
          <h1 className="display mt-4 max-w-2xl text-[clamp(3.5rem,9vw,7rem)] leading-[0.85]">{sport.name}</h1>
          {sport.summary && <p className="mt-4 max-w-lg text-lg text-white/85">{sport.summary}</p>}
          <div className="mt-7 flex flex-wrap gap-2">
            <button
              type="button"
              className={`btn ${following ? 'bg-white text-black' : 'bg-black/50 text-white backdrop-blur hover:bg-black/70'}`}
              onClick={() => {
                void toggleFollow(sport.id)
                toast(following ? `Unfollowed ${sport.name}` : `Following ${sport.name}`)
              }}
            >
              {following ? '★ Following' : '☆ Follow'}
            </button>
            {access.is_admin && (
              <button type="button" className="btn bg-white/90 text-black" onClick={() => setEditing(true)}>
                Edit sport
              </button>
            )}
          </div>
        </div>
      </section>

      <div className="mt-10 grid gap-10 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-12">
          {sport.body.trim() && <Markdown source={sport.body} />}

          <section>
            <h2 className="display text-3xl">Upcoming</h2>
            <div className="card mt-4 divide-y divide-[var(--line)] p-5">
              {upcoming.length === 0 ? (
                <p className="text-sm faint">Nothing scheduled yet.</p>
              ) : (
                upcoming.slice(0, 8).map((e) => (
                  <div key={e.id} className="py-2.5 first:pt-0 last:pb-0">
                    <EventRow event={e} onOpen={open} showDate />
                  </div>
                ))
              )}
            </div>
          </section>

          {results.length > 0 && (
            <section>
              <h2 className="display text-3xl">Results</h2>
              <div className="card mt-4 divide-y divide-[var(--line)] p-5">
                {results.slice(0, 8).map((e) => (
                  <div key={e.id} className="py-2.5 first:pt-0 last:pb-0">
                    <EventRow event={e} onOpen={open} showDate />
                  </div>
                ))}
              </div>
            </section>
          )}

          {athletes.length > 0 && (
            <section>
              <h2 className="display text-3xl">Athletes</h2>
              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
                {athletes.map((a) => (
                  <Link key={a.id} to={`/athletes/${a.id}`} className="card group overflow-hidden">
                    <div className="aspect-square bg-surface-2">
                      {a.photo_url ? (
                        <img src={a.photo_url} alt="" className="size-full object-cover transition group-hover:scale-105" />
                      ) : (
                        <div className="display grid size-full place-items-center text-5xl text-ink/15">{a.jersey || a.full_name[0]}</div>
                      )}
                    </div>
                    <div className="p-3">
                      <p className="font-bold leading-tight group-hover:text-signal">{a.full_name}</p>
                      {a.headline && <p className="text-xs muted">{a.headline}</p>}
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          )}
        </div>

        <aside className="space-y-4">
          {played > 0 && (
            <div className="card overflow-hidden">
              <p className="stage eyebrow bg-ink px-5 py-3 !text-paper/70">This school year</p>
              <div className="grid grid-cols-3 divide-x divide-[var(--line)] text-center">
                {(
                  [
                    ['W', record.win],
                    ['L', record.loss],
                    ['D', record.draw],
                  ] as const
                ).map(([k, v]) => (
                  <div key={k} className="py-4">
                    <div className="display num text-5xl">{v}</div>
                    <div className="text-xs font-bold muted">{k}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
          <InfoCard label="Teams" value={sport.divisions} />
          <InfoCard label="Coach" value={sport.coach} />
          <InfoCard label="Practice" value={sport.practice_info} />
          <InfoCard label="How to join" value={sport.how_to_join} highlight />
          {notices.length > 0 && (
            <div className="card p-5">
              <p className="eyebrow">Notices</p>
              <ul className="mt-3 space-y-3">
                {notices.map((n) => (
                  <li key={n.id}>
                    <Link to={`/notices/${n.id}`} className="group block">
                      <span className="block font-semibold leading-snug group-hover:text-signal">{n.title}</span>
                      <span className="block text-xs faint">{fmtDate(n.created_at)} · {plainText(n.body, 60)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </aside>
      </div>

      {editing && (
        <SportForm
          sport={sport}
          onClose={() => setEditing(false)}
          onSaved={(saved) => {
            void reloadSports()
            if (!saved) navigate('/sports')
            else if (saved.slug !== sport.slug) navigate(`/sports/${saved.slug}`, { replace: true })
          }}
        />
      )}
    </div>
  )
}

function InfoCard({ label, value, highlight }: { label: string; value: string | null; highlight?: boolean }) {
  if (!value?.trim()) return null
  return (
    <div className={`card p-5 ${highlight ? 'border-signal/40 bg-[var(--signal-soft)]' : ''}`}>
      <p className="eyebrow">{label}</p>
      <p className="mt-1.5 whitespace-pre-line font-medium">{value}</p>
    </div>
  )
}
