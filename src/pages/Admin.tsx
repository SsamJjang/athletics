import type { ReactNode } from 'react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useData } from '../context/DataContext'
import { fmtDate, fmtDay, fmtTime, relative } from '../lib/dates'
import { fetchTotals } from '../lib/events'
import { kindOf } from '../lib/meta'
import { supabase } from '../lib/supabase'
import type { Athlete, GEvent, Notice, ParentLink, Profile, Sport } from '../lib/types'
import AthleteForm from '../components/admin/AthleteForm'
import EventForm from '../components/admin/EventForm'
import NoticeForm from '../components/admin/NoticeForm'
import SportForm from '../components/admin/SportForm'
import { Avatar, EmptyState, PageHeader, SeasonTag, Spinner, useToast } from '../components/ui'

type Tab = 'events' | 'notices' | 'sports' | 'athletes' | 'people'
const TABS: { id: Tab; label: string }[] = [
  { id: 'events', label: 'Events' },
  { id: 'notices', label: 'Notices' },
  { id: 'sports', label: 'Sports' },
  { id: 'athletes', label: 'Athletes' },
  { id: 'people', label: 'People & families' },
]

export default function Admin() {
  const { access, loading } = useAuth()
  const [params, setParams] = useSearchParams()
  const tab = (params.get('tab') as Tab) || 'events'

  if (loading) return <Spinner />
  if (!access.is_admin) {
    return (
      <EmptyState icon="🔒" title="Admins only">
        Admin access is granted by email in <code>supabase/admins.sql</code>.
      </EmptyState>
    )
  }

  return (
    <div>
      <PageHeader eyebrow="Student Council ADs" title="Admin">
        Everything here is also editable in place — look for Edit buttons across the site.
      </PageHeader>
      <div className="scroll-x -mx-4 mb-8 flex gap-1 border-b hairline px-4 sm:mx-0 sm:px-0">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setParams({ tab: t.id }, { replace: true })}
            className={`nav-link mb-[-1px] whitespace-nowrap px-3 !py-3 ${tab === t.id ? 'active' : ''}`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'events' && <EventsTab />}
      {tab === 'notices' && <NoticesTab />}
      {tab === 'sports' && <SportsTab />}
      {tab === 'athletes' && <AthletesTab />}
      {tab === 'people' && <PeopleTab />}
    </div>
  )
}

function Toolbar({ children }: { children: ReactNode }) {
  return <div className="mb-4 flex flex-wrap items-center gap-2">{children}</div>
}

function Search({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return <input className="input !w-full !rounded-full !py-2 text-sm sm:!w-72" placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)} />
}

/* ------------------------------------------------------------------ */

function EventsTab() {
  const { sportById } = useData()
  const [events, setEvents] = useState<GEvent[] | null>(null)
  const [totals, setTotals] = useState<Map<string, number>>(new Map())
  const [when, setWhen] = useState<'upcoming' | 'past'>('upcoming')
  const [q, setQ] = useState('')
  const [editing, setEditing] = useState<GEvent | 'new' | null>(null)

  const load = useCallback(async () => {
    const now = new Date().toISOString()
    const query = supabase.from('events').select('*').limit(300)
    const { data } =
      when === 'upcoming'
        ? await query.gte('starts_at', now).order('starts_at')
        : await query.lt('starts_at', now).order('starts_at', { ascending: false })
    const list = (data as GEvent[]) ?? []
    setEvents(list)
    setTotals(await fetchTotals(list.filter((e) => e.signup_enabled).map((e) => e.id)))
  }, [when])

  useEffect(() => {
    void load()
  }, [load])

  const shown = (events ?? []).filter((e) => !q || `${e.title} ${e.location ?? ''} ${e.opponent ?? ''}`.toLowerCase().includes(q.toLowerCase()))

  return (
    <>
      <Toolbar>
        <div className="segmented">
          {(['upcoming', 'past'] as const).map((w) => (
            <button key={w} type="button" aria-pressed={when === w} onClick={() => setWhen(w)} className="capitalize">
              {w}
            </button>
          ))}
        </div>
        <Search value={q} onChange={setQ} placeholder="Search events" />
        <button type="button" className="btn btn-primary btn-sm ml-auto" onClick={() => setEditing('new')}>
          + Event
        </button>
      </Toolbar>
      {events === null ? (
        <Spinner />
      ) : shown.length === 0 ? (
        <EmptyState icon="📅" title="No events" />
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b hairline text-left text-xs muted">
                <th className="px-4 py-3 font-semibold">When</th>
                <th className="px-4 py-3 font-semibold">Event</th>
                <th className="px-4 py-3 font-semibold">Type</th>
                <th className="px-4 py-3 font-semibold">Sign-ups</th>
                <th className="px-4 py-3 font-semibold">{when === 'past' ? 'Result' : ''}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--line)]">
              {shown.map((e) => {
                const s = e.sport_id ? sportById.get(e.sport_id) : undefined
                const k = kindOf(e.kind)
                return (
                  <tr key={e.id} className="cursor-pointer hover:bg-surface-2/50" onClick={() => setEditing(e)}>
                    <td className="whitespace-nowrap px-4 py-3 num">
                      {fmtDay(e.starts_at)} <span className="muted">{e.all_day ? '' : fmtTime(e.starts_at)}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`font-semibold ${e.cancelled ? 'line-through opacity-60' : ''}`}>{e.title}</span>
                      {s && <span className="ml-2 text-xs muted">{s.emoji} {s.name}</span>}
                      {e.series_id && <span className="ml-2 text-xs faint">↻ weekly</span>}
                      {e.members_only && <span className="ml-2 tag bg-surface-2">Members</span>}
                    </td>
                    <td className="px-4 py-3">
                      <span className="tag" style={{ color: k.color, background: `color-mix(in oklab, ${k.color} 12%, transparent)` }}>{k.label}</span>
                    </td>
                    <td className="px-4 py-3 num">{e.signup_enabled ? `${totals.get(e.id) ?? 0}${e.capacity ? ` / ${e.capacity}` : ''}` : <span className="faint">—</span>}</td>
                    <td className="px-4 py-3">
                      {when === 'past' && (e.kind === 'game' || e.kind === 'tournament') && (e.result || e.outcome ? <span className="num">{e.outcome?.[0].toUpperCase()} {e.result}</span> : <span className="text-xs text-signal">Add result</span>)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-3 text-xs faint">Click a row to edit it. To see who signed up, open the event on the calendar.</p>
      {editing && <EventForm event={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={() => void load()} />}
    </>
  )
}

function NoticesTab() {
  const [list, setList] = useState<Notice[] | null>(null)
  const [editing, setEditing] = useState<Notice | 'new' | null>(null)
  const load = useCallback(() => {
    void supabase
      .from('notices')
      .select('*')
      .order('created_at', { ascending: false })
      .then(({ data }) => setList((data as Notice[]) ?? []))
  }, [])
  useEffect(load, [load])

  return (
    <>
      <Toolbar>
        <button type="button" className="btn btn-primary btn-sm ml-auto" onClick={() => setEditing('new')}>
          + Notice
        </button>
      </Toolbar>
      {list === null ? (
        <Spinner />
      ) : list.length === 0 ? (
        <EmptyState icon="📣" title="No notices yet" />
      ) : (
        <ul className="card divide-y divide-[var(--line)]">
          {list.map((n) => (
            <li key={n.id}>
              <button type="button" onClick={() => setEditing(n)} className="flex w-full items-center gap-3 px-5 py-4 text-left hover:bg-surface-2/50">
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{n.title}</span>
                  <span className="text-xs muted">{fmtDate(n.created_at)}</span>
                </span>
                {n.pinned && <span className="tag bg-signal text-white">Pinned</span>}
                {n.members_only && <span className="tag bg-surface-2">Members</span>}
                {!n.published && <span className="tag bg-surface-2">Draft</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
      {editing && <NoticeForm notice={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} onSaved={load} />}
    </>
  )
}

function SportsTab() {
  const { sports, reloadSports } = useData()
  const [editing, setEditing] = useState<Sport | 'new' | null>(null)
  return (
    <>
      <Toolbar>
        <p className="text-sm muted">Hidden sports are only visible to admins.</p>
        <button type="button" className="btn btn-primary btn-sm ml-auto" onClick={() => setEditing('new')}>
          + Sport
        </button>
      </Toolbar>
      <ul className="card divide-y divide-[var(--line)]">
        {sports.map((s) => (
          <li key={s.id}>
            <button type="button" onClick={() => setEditing(s)} className={`flex w-full items-center gap-3 px-5 py-3 text-left hover:bg-surface-2/50 ${s.active ? '' : 'opacity-50'}`}>
              <span className="grid size-10 place-items-center rounded-xl text-xl" style={{ background: `color-mix(in oklab, ${s.color} 20%, transparent)` }}>
                {s.emoji}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-semibold">{s.name}</span>
                <span className="text-xs muted">/sports/{s.slug}</span>
              </span>
              <SeasonTag season={s.season} />
              {s.tier === 'opportunity' && <span className="tag gold-fill">Opportunity</span>}
              {!s.active && <span className="tag bg-surface-2">Hidden</span>}
            </button>
          </li>
        ))}
      </ul>
      {editing && <SportForm sport={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} onSaved={() => void reloadSports()} />}
    </>
  )
}

function AthletesTab() {
  const [list, setList] = useState<Athlete[] | null>(null)
  const [editing, setEditing] = useState<Athlete | 'new' | null>(null)
  const load = useCallback(() => {
    void supabase
      .from('athletes')
      .select('*')
      .order('sort_order')
      .order('full_name')
      .then(({ data }) => setList((data as Athlete[]) ?? []))
  }, [])
  useEffect(load, [load])

  return (
    <>
      <Toolbar>
        <button type="button" className="btn btn-primary btn-sm ml-auto" onClick={() => setEditing('new')}>
          + Athlete
        </button>
      </Toolbar>
      {list === null ? (
        <Spinner />
      ) : list.length === 0 ? (
        <EmptyState icon="🏅" title="No spotlights yet" />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((a) => (
            <button key={a.id} type="button" onClick={() => setEditing(a)} className={`card flex items-center gap-3 p-3 text-left hover:border-ink ${a.published ? '' : 'opacity-50'}`}>
              <Avatar name={a.full_name} url={a.photo_url} size={48} />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold">{a.full_name}</span>
                <span className="block truncate text-xs muted">{a.headline}</span>
              </span>
              {a.featured && <span className="tag gold-fill">★</span>}
            </button>
          ))}
        </div>
      )}
      {editing && <AthleteForm athlete={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} onSaved={load} />}
    </>
  )
}

/* ------------------------------------------------------------------ */

type Person = Profile & { children: (ParentLink & { student: { full_name: string; email: string } | null })[] }

function PeopleTab() {
  const toast = useToast()
  const [people, setPeople] = useState<Person[] | null>(null)
  const [filter, setFilter] = useState<'all' | 'school' | 'verified' | 'unverified'>('unverified')
  const [q, setQ] = useState('')

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('profiles')
      .select('*, children:parent_links!parent_links_parent_id_fkey(*, student:profiles!parent_links_student_id_fkey(full_name,email))')
      .order('created_at', { ascending: false })
      .limit(2000)
    setPeople((data as Person[]) ?? [])
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const isVerified = (p: Person) => p.admin_verified || p.children.length > 0
  const counts = useMemo(() => {
    const list = people ?? []
    return {
      all: list.length,
      school: list.filter((p) => p.kind === 'school').length,
      verified: list.filter((p) => p.kind === 'parent' && isVerified(p)).length,
      unverified: list.filter((p) => p.kind === 'parent' && !isVerified(p)).length,
    }
  }, [people])

  const shown = (people ?? []).filter((p) => {
    if (filter === 'school' && p.kind !== 'school') return false
    if (filter === 'verified' && !(p.kind === 'parent' && isVerified(p))) return false
    if (filter === 'unverified' && !(p.kind === 'parent' && !isVerified(p))) return false
    if (q && !`${p.full_name} ${p.email}`.toLowerCase().includes(q.toLowerCase())) return false
    return true
  })

  async function setVerified(p: Person, on: boolean) {
    if (on && !window.confirm(`Verify ${p.full_name || p.email} as a GCS parent? Only do this if you've confirmed who they are.`)) return
    const { error } = await supabase.from('profiles').update({ admin_verified: on }).eq('id', p.id)
    toast(error ? error.message : on ? 'Verified' : 'Verification removed')
    void load()
  }

  async function unlink(p: Person, studentId: string) {
    if (!window.confirm('Remove this parent–student link?')) return
    await supabase.from('parent_links').delete().eq('parent_id', p.id).eq('student_id', studentId)
    toast('Link removed')
    void load()
  }

  return (
    <>
      <Toolbar>
        <div className="scroll-x flex gap-1.5">
          {(
            [
              ['unverified', 'Unverified parents'],
              ['verified', 'Verified parents'],
              ['school', 'GCS accounts'],
              ['all', 'Everyone'],
            ] as const
          ).map(([id, label]) => (
            <button key={id} type="button" className="chip" aria-pressed={filter === id} onClick={() => setFilter(id)}>
              {label} <span className="num opacity-60">{counts[id]}</span>
            </button>
          ))}
        </div>
        <Search value={q} onChange={setQ} placeholder="Search name or email" />
      </Toolbar>

      <div className="mb-4 rounded-xl border hairline bg-surface-2/40 p-4 text-sm muted">
        Parents normally verify themselves with a code from their child. Use <b>Verify</b> only for families you’ve confirmed another way (e.g. the office knows them). Admins are set by email in{' '}
        <code>supabase/admins.sql</code>.
      </div>

      {people === null ? (
        <Spinner />
      ) : shown.length === 0 ? (
        <EmptyState icon="👋" title="Nobody here" />
      ) : (
        <ul className="card divide-y divide-[var(--line)]">
          {shown.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center gap-3 px-5 py-3.5">
              <Avatar name={p.full_name || p.email} url={p.avatar_url} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">
                  {p.full_name || <span className="muted">No name</span>}
                  {p.kind === 'school' && p.grade && <span className="ml-2 text-xs font-normal muted">Gr {p.grade}</span>}
                </p>
                <p className="truncate text-xs muted">
                  {p.email} · joined {relative(p.created_at)}
                </p>
                {p.children.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {p.children.map((c) => (
                      <span key={c.student_id} className="tag bg-surface-2 !normal-case !tracking-normal">
                        {c.relationship} of {c.student?.full_name || c.student?.email}
                        <button type="button" className="ml-1 opacity-60 hover:opacity-100" onClick={() => void unlink(p, c.student_id)} aria-label="Remove link">
                          ✕
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
              {p.kind === 'school' ? (
                <span className="tag bg-surface-2">GCS</span>
              ) : isVerified(p) ? (
                <div className="flex items-center gap-2">
                  <span className="tag gold-fill">{p.children.length ? 'Code-verified' : 'Admin-verified'}</span>
                  {p.admin_verified && (
                    <button type="button" className="btn btn-quiet btn-sm" onClick={() => void setVerified(p, false)}>
                      Unverify
                    </button>
                  )}
                </div>
              ) : (
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => void setVerified(p, true)}>
                  Verify
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      <p className="mt-3 text-xs faint">
        Need to see the site as a parent? <Link to="/family" className="underline">My family</Link> shows what verified parents see.
      </p>
    </>
  )
}
