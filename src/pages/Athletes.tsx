import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useData } from '../context/DataContext'
import { isConfigured, supabase } from '../lib/supabase'
import type { Athlete } from '../lib/types'
import AthleteForm from '../components/admin/AthleteForm'
import { EmptyState, Markdown, PageHeader, Spinner, SportTag } from '../components/ui'

function Gate() {
  const { profile } = useAuth()
  return (
    <EmptyState
      icon="🔒"
      title="For the GCS community"
      action={
        profile?.kind === 'parent' ? (
          <Link to="/family" className="btn btn-ink">
            Verify my parent account
          </Link>
        ) : null
      }
    >
      Athlete profiles show students’ names and photos, so they’re only visible to GCS students, staff and verified parents.
    </EmptyState>
  )
}

function AthleteCard({ a }: { a: Athlete }) {
  const { sportById } = useData()
  const color = sportById.get(a.sport_ids[0])?.color ?? 'var(--signal)'
  return (
    <Link to={`/athletes/${a.id}`} className={`stage group relative block overflow-hidden rounded-[22px] bg-ink text-paper shadow-[var(--shadow)] transition duration-300 hover:-translate-y-1 hover:rotate-[-0.6deg] hover:shadow-[var(--shadow-lg)] ${!a.published ? 'opacity-50' : ''}`}>
      <div className="relative aspect-[3/4]">
        {a.photo_url ? (
          <img src={a.photo_url} alt="" className="absolute inset-0 size-full object-cover transition duration-500 group-hover:scale-105" />
        ) : (
          <div className="absolute inset-0" style={{ background: `linear-gradient(160deg, ${color}, #1b1314 75%)` }} />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/10 to-transparent" />
        <div className="absolute left-0 top-5 h-1.5 w-16" style={{ background: color }} />
        {a.jersey && <span className="display absolute right-4 top-2 text-7xl text-white/85 drop-shadow-lg">{a.jersey}</span>}
        {a.featured && <span className="tag absolute left-4 top-9 gold-fill">★ Featured</span>}
        <div className="absolute inset-x-0 bottom-0 p-5">
          <p className="text-[11px] font-bold uppercase tracking-widest text-white/60">
            {a.grade ? `Grade ${a.grade}` : ''}
            {a.grade && a.headline ? ' · ' : ''}
            {a.headline}
          </p>
          <h3 className="display mt-1 text-4xl leading-[0.9] text-white">{a.full_name}</h3>
          <div className="mt-3 flex flex-wrap gap-1">
            {a.sport_ids.map((id) => {
              const s = sportById.get(id)
              return s ? (
                <span key={id} className="tag bg-white/12 text-white backdrop-blur">
                  {s.emoji} {s.name}
                </span>
              ) : null
            })}
          </div>
        </div>
      </div>
    </Link>
  )
}

export default function Athletes() {
  const { access, loading } = useAuth()
  const { sports } = useData()
  const [list, setList] = useState<Athlete[] | null>(null)
  const [sport, setSport] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)

  const load = () => {
    if (!isConfigured || !access.is_community) return setList([])
    void supabase
      .from('athletes')
      .select('*')
      .order('featured', { ascending: false })
      .order('sort_order')
      .order('full_name')
      .then(({ data }) => setList((data as Athlete[]) ?? []))
  }
  useEffect(load, [access.is_community])

  const shown = (list ?? []).filter((a) => !sport || a.sport_ids.includes(sport))
  const usedSports = sports.filter((s) => list?.some((a) => a.sport_ids.includes(s.id)))

  return (
    <div>
      <PageHeader
        eyebrow="The people behind the jerseys"
        title="Meet our athletes"
        actions={
          access.is_admin && (
            <button type="button" className="btn btn-primary btn-sm" onClick={() => setCreating(true)}>
              + Athlete
            </button>
          )
        }
      >
        Captains, first-years, record-breakers and the teammates who hold it all together — in their own words.
      </PageHeader>

      {loading || (access.is_community && list === null) ? (
        <Spinner />
      ) : !access.is_community ? (
        <Gate />
      ) : (
        <>
          {usedSports.length > 1 && (
            <div className="scroll-x -mx-4 mb-8 flex gap-1.5 px-4 sm:mx-0 sm:px-0">
              <button type="button" className="chip" aria-pressed={!sport} onClick={() => setSport(null)}>
                All
              </button>
              {usedSports.map((s) => (
                <button key={s.id} type="button" className="chip" aria-pressed={sport === s.id} onClick={() => setSport(s.id)}>
                  {s.emoji} {s.name}
                </button>
              ))}
            </div>
          )}
          {shown.length === 0 ? (
            <EmptyState icon="🏅" title="First spotlights coming soon">
              The ADs are interviewing athletes. Know someone who deserves a feature? Tell a StuCo AD.
            </EmptyState>
          ) : (
            <div className="grid grid-cols-1 gap-5 min-[480px]:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {shown.map((a) => (
                <AthleteCard key={a.id} a={a} />
              ))}
            </div>
          )}
        </>
      )}

      {creating && <AthleteForm onClose={() => setCreating(false)} onSaved={load} />}
    </div>
  )
}

export function AthleteDetail() {
  const { id } = useParams()
  const { access, loading } = useAuth()
  const { sportById } = useData()
  const navigate = useNavigate()
  const [a, setA] = useState<Athlete | null | undefined>(undefined)
  const [editing, setEditing] = useState(false)

  const load = () => {
    if (!isConfigured || !access.is_community) return setA(null)
    void supabase
      .from('athletes')
      .select('*')
      .eq('id', id ?? '')
      .maybeSingle()
      .then(({ data }) => setA((data as Athlete) ?? null))
  }
  useEffect(load, [id, access.is_community])

  if (loading || a === undefined) return <Spinner />
  if (!access.is_community) return <Gate />
  if (!a) return <EmptyState icon="🧭" title="Athlete not found" action={<Link to="/athletes" className="btn btn-ink">All athletes</Link>} />

  const color = sportById.get(a.sport_ids[0])?.color ?? 'var(--signal)'
  return (
    <article className="rise">
      <Link to="/athletes" className="text-sm font-semibold muted hover:text-ink">
        ← All athletes
      </Link>
      <div className="mt-6 grid gap-10 lg:grid-cols-[420px_1fr]">
        <div className="relative">
          <div className="stage relative aspect-[3/4] overflow-hidden rounded-[28px] bg-ink lg:sticky lg:top-24">
            {a.photo_url ? (
              <img src={a.photo_url} alt={a.full_name} className="size-full object-cover" />
            ) : (
              <div className="size-full" style={{ background: `linear-gradient(160deg, ${color}, #1b1314 80%)` }} />
            )}
            {a.jersey && <span className="display absolute bottom-3 right-5 text-[8rem] leading-none text-white/90 drop-shadow-2xl">{a.jersey}</span>}
            <div className="absolute left-0 top-8 h-2 w-24" style={{ background: color }} />
          </div>
        </div>

        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            {a.sport_ids.map((sid) => (
              <SportTag key={sid} sport={sportById.get(sid)} size="md" />
            ))}
            {a.grade && <span className="tag bg-surface-2">Grade {a.grade}</span>}
            {access.is_admin && (
              <button type="button" className="btn btn-ghost btn-sm ml-auto" onClick={() => setEditing(true)}>
                Edit
              </button>
            )}
          </div>
          <h1 className="display mt-4 text-[clamp(3.5rem,8vw,6.5rem)] leading-[0.85]">{a.full_name}</h1>
          {a.headline && <p className="mt-3 text-xl font-semibold muted">{a.headline}</p>}

          {a.quote && (
            <blockquote className="stage relative mt-10 rounded-3xl bg-ink p-8 text-paper">
              <span className="display absolute -top-6 left-6 text-8xl leading-none text-volt" aria-hidden>
                “
              </span>
              <p className="relative text-2xl font-semibold leading-snug">{a.quote}</p>
            </blockquote>
          )}

          <Markdown source={a.bio} className="mt-10" />

          {a.qa.length > 0 && (
            <section className="mt-12">
              <p className="eyebrow">Locker-room Q&amp;A</p>
              <dl className="mt-4 divide-y divide-[var(--line)] border-y hairline">
                {a.qa.map((item, i) => (
                  <div key={i} className="grid gap-1 py-5 sm:grid-cols-[1fr_1.4fr] sm:gap-8">
                    <dt className="display text-2xl">{item.q}</dt>
                    <dd className="text-lg">{item.a}</dd>
                  </div>
                ))}
              </dl>
            </section>
          )}
        </div>
      </div>
      {editing && (
        <AthleteForm athlete={a} onClose={() => setEditing(false)} onSaved={(deleted) => (deleted ? navigate('/athletes') : load())} />
      )}
    </article>
  )
}
