import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useData } from '../context/DataContext'
import { SEASONS, currentSeason } from '../lib/meta'
import type { Season, Sport } from '../lib/types'
import SportForm from '../components/admin/SportForm'
import { EmptyState, PageHeader, SeasonTag, Spinner } from '../components/ui'

export function SportCard({ sport, big = false, showSeason = true }: { sport: Sport; big?: boolean; showSeason?: boolean }) {
  const { follows } = useData()
  return (
    <Link
      to={`/sports/${sport.slug}`}
      className={`card group relative flex flex-col overflow-hidden transition duration-300 hover:-translate-y-1 hover:shadow-[var(--shadow-lg)] ${!sport.active ? 'opacity-50' : ''}`}
    >
      <div className={`relative overflow-hidden ${big ? 'h-44' : 'h-32'}`} style={{ background: sport.color }}>
        {sport.cover_url ? (
          <img src={sport.cover_url} alt="" className="absolute inset-0 size-full object-cover transition duration-500 group-hover:scale-105" />
        ) : (
          <>
            <div className="stripes absolute inset-0 text-white/15" aria-hidden />
            <span className="absolute -bottom-6 -right-2 text-[7.5rem] leading-none drop-shadow-lg transition duration-500 group-hover:-rotate-6 group-hover:scale-110" aria-hidden>
              {sport.emoji}
            </span>
          </>
        )}
        <div className="absolute left-3 top-3 flex gap-1.5">
          {showSeason && <span className="tag bg-black/55 text-white backdrop-blur">{SEASONS.find((s) => s.id === sport.season)?.label}</span>}
          {follows.has(sport.id) && <span className="tag gold-fill">★ Following</span>}
        </div>
      </div>
      <div className="flex flex-1 flex-col p-5">
        <h3 className="display text-3xl group-hover:text-signal">{sport.name}</h3>
        {sport.divisions && <p className="mt-1 text-xs font-semibold muted">{sport.divisions}</p>}
        {sport.summary && <p className="mt-3 text-sm muted line-clamp-2">{sport.summary}</p>}
      </div>
    </Link>
  )
}

export default function Sports() {
  const { access } = useAuth()
  const { sports, sportsLoading, reloadSports } = useData()
  const [season, setSeason] = useState<Season | 'all'>('all')
  const [creating, setCreating] = useState(false)
  const now = currentSeason()

  const teams = sports.filter((s) => s.tier === 'team')
  const opportunities = sports.filter((s) => s.tier === 'opportunity')
  const seasons = SEASONS.filter((s) => season === 'all' || s.id === season)

  return (
    <div>
      <PageHeader
        eyebrow="Programs"
        title="Sports at GCS"
        actions={
          access.is_admin && (
            <button type="button" className="btn btn-primary btn-sm" onClick={() => setCreating(true)}>
              + Sport
            </button>
          )
        }
      >
        Three seasons of school teams — and a set of smaller sports where GCS can enter competitions when the chance comes up.
      </PageHeader>

      <div className="scroll-x -mx-4 mb-10 flex gap-2 px-4 sm:mx-0 sm:px-0">
        <button type="button" className="chip" aria-pressed={season === 'all'} onClick={() => setSeason('all')}>
          All seasons
        </button>
        {SEASONS.map((s) => (
          <button key={s.id} type="button" className="chip" aria-pressed={season === s.id} onClick={() => setSeason(s.id)}>
            <span className="dot" style={{ ['--pill' as string]: s.color }} />
            {s.label}
            {s.id === now && <span className="text-[10px] font-bold uppercase text-signal">· now</span>}
          </button>
        ))}
      </div>

      {sportsLoading ? (
        <Spinner />
      ) : sports.length === 0 ? (
        <EmptyState icon="🏟️" title="No sports yet">
          An admin can add them — or run <code>supabase/seed.sql</code> for a starter set.
        </EmptyState>
      ) : (
        <div className="space-y-14">
          {seasons.map((s) => {
            const list = teams.filter((t) => t.season === s.id)
            if (!list.length) return null
            return (
              <section key={s.id}>
                <div className="mb-5 flex items-center gap-4">
                  <span className="h-10 w-2 -skew-x-12" style={{ background: s.color }} />
                  <div>
                    <h2 className="display text-4xl">{s.label}</h2>
                    <p className="text-xs font-semibold muted">{s.months}</p>
                  </div>
                  {s.id === now && <span className="tag gold-fill">In season</span>}
                </div>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {list.map((t) => (
                    <SportCard key={t.id} sport={t} />
                  ))}
                </div>
              </section>
            )
          })}

          {opportunities.length > 0 && (season === 'all' || opportunities.some((o) => o.season === season)) && (
            <section className="stage relative overflow-hidden rounded-[28px] bg-ink p-6 text-paper sm:p-10">
              <div className="relative">
                <p className="eyebrow !text-volt">Beyond the big teams</p>
                <h2 className="display mt-2 text-5xl">Opportunities</h2>
                <p className="mt-3 max-w-xl text-paper/70">
                  Smaller or less common sports GCS may be able to enter. No tryouts, no experience needed — follow one to hear when a chance comes up.
                </p>
                <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {opportunities
                    .filter((o) => season === 'all' || o.season === season)
                    .map((o) => (
                      <Link
                        key={o.id}
                        to={`/sports/${o.slug}`}
                        className={`group flex items-start gap-4 rounded-2xl border border-paper/12 bg-paper/[0.04] p-5 transition hover:border-volt hover:bg-paper/[0.08] ${!o.active ? 'opacity-50' : ''}`}
                      >
                        <span className="grid size-14 shrink-0 place-items-center rounded-xl text-3xl" style={{ background: o.color }}>
                          {o.emoji}
                        </span>
                        <span className="min-w-0">
                          <span className="display block text-2xl group-hover:text-volt">{o.name}</span>
                          <span className="mt-1 block text-sm text-paper/60 line-clamp-2">{o.summary}</span>
                          <span className="mt-2 inline-block">
                            <SeasonTag season={o.season} />
                          </span>
                        </span>
                      </Link>
                    ))}
                </div>
              </div>
            </section>
          )}
        </div>
      )}

      {creating && <SportForm onClose={() => setCreating(false)} onSaved={() => void reloadSports()} />}
    </div>
  )
}
