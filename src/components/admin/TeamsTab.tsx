import { useCallback, useEffect, useMemo, useState } from 'react'
import { useData } from '../../context/DataContext'
import { SCHOOL_DOMAIN, supabase } from '../../lib/supabase'
import type { Profile, TeamMember } from '../../lib/types'
import { Avatar, EmptyState, Notice, Spinner, useToast } from '../ui'

const EMAIL = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/

/**
 * Team rosters. Being on a roster is what lets a student (and their
 * verified parents) see that team's "Team only" practices and meetings,
 * on the site and in their subscribed Google Calendar.
 */
export default function TeamsTab() {
  const { sports, reloadTeams } = useData()
  const toast = useToast()
  const [rows, setRows] = useState<TeamMember[] | null>(null)
  const [people, setPeople] = useState<Map<string, Pick<Profile, 'email' | 'full_name' | 'avatar_url' | 'grade'>>>(new Map())
  const [sportId, setSportId] = useState<string | null>(null)
  const [paste, setPaste] = useState('')
  const [busy, setBusy] = useState(false)
  const [warning, setWarning] = useState<string | null>(null)

  const load = useCallback(async () => {
    const { data } = await supabase.from('team_members').select('*').order('email')
    const list = (data as TeamMember[]) ?? []
    setRows(list)
    const emails = [...new Set(list.map((r) => r.email))]
    if (emails.length) {
      const { data: profs } = await supabase.from('profiles').select('email,full_name,avatar_url,grade').in('email', emails)
      setPeople(new Map(((profs ?? []) as Profile[]).map((p) => [p.email, p])))
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (!sportId && sports.length) setSportId(sports[0].id)
  }, [sports, sportId])

  const counts = useMemo(() => {
    const m = new Map<string, number>()
    for (const r of rows ?? []) m.set(r.sport_id, (m.get(r.sport_id) ?? 0) + 1)
    return m
  }, [rows])

  const sport = sports.find((s) => s.id === sportId)
  const roster = (rows ?? []).filter((r) => r.sport_id === sportId)

  async function add() {
    if (!sportId) return
    setWarning(null)
    const tokens = paste
      .split(/[\s,;]+/)
      .map((t) => t.trim().toLowerCase().replace(/^<|>$/g, ''))
      .filter(Boolean)
    const valid = [...new Set(tokens.filter((t) => EMAIL.test(t)))]
    const invalid = tokens.filter((t) => !EMAIL.test(t))
    const fresh = valid.filter((e) => !roster.some((r) => r.email === e))
    if (!fresh.length) {
      setWarning(invalid.length ? `Those don’t look like email addresses: ${invalid.join(', ')}` : 'They’re already on the roster.')
      return
    }
    setBusy(true)
    const { error } = await supabase.from('team_members').insert(fresh.map((email) => ({ sport_id: sportId, email })))
    setBusy(false)
    if (error) return setWarning(error.message)
    const outside = fresh.filter((e) => !e.endsWith(`@${SCHOOL_DOMAIN}`))
    const notes = [
      invalid.length ? `Skipped (not emails): ${invalid.join(', ')}` : '',
      outside.length ? `Heads up — not school addresses: ${outside.join(', ')}` : '',
    ].filter(Boolean)
    if (notes.length) setWarning(notes.join(' · '))
    setPaste('')
    toast(`Added ${fresh.length} to ${sport?.name ?? 'the team'}`)
    await load()
    await reloadTeams()
  }

  async function remove(email: string) {
    if (!sportId || !window.confirm(`Remove ${email} from ${sport?.name}? They’ll stop seeing the team’s private events.`)) return
    await supabase.from('team_members').delete().eq('sport_id', sportId).eq('email', email)
    toast('Removed')
    await load()
    await reloadTeams()
  }

  if (rows === null) return <Spinner />
  if (!sports.length) return <EmptyState icon="🏟️" title="Add a sport first" />

  return (
    <div className="grid gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
      <ul className="card h-fit divide-y divide-[var(--line)] overflow-hidden">
        {sports.map((s) => (
          <li key={s.id}>
            <button
              type="button"
              onClick={() => {
                setSportId(s.id)
                setWarning(null)
              }}
              className={`flex w-full items-center gap-3 px-4 py-3 text-left transition ${s.id === sportId ? 'bg-[var(--signal-soft)]' : 'hover:bg-surface-2/60'}`}
            >
              <span className="grid size-8 place-items-center rounded-lg text-base" style={{ background: `color-mix(in oklab, ${s.color} 20%, transparent)` }}>
                {s.emoji}
              </span>
              <span className={`min-w-0 flex-1 truncate font-semibold ${s.id === sportId ? 'text-signal' : ''}`}>{s.name}</span>
              <span className="num text-xs muted">{counts.get(s.id) ?? 0}</span>
            </button>
          </li>
        ))}
      </ul>

      {sport && (
        <section className="card p-5 sm:p-6">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="display text-3xl">
              {sport.emoji} {sport.name} roster
            </h2>
            <span className="text-sm muted">{roster.length} {roster.length === 1 ? 'athlete' : 'athletes'}</span>
          </div>
          <p className="mt-1 text-sm muted">
            People on this roster (and their verified parents) see {sport.name}’s <b>🔒 Team only</b> events — practices, team meetings — on the site and in their
            subscribed calendar.
          </p>

          <div className="mt-5 rounded-2xl border border-dashed border-[var(--line-strong)] p-4">
            <label className="label" htmlFor="roster-paste">
              Add athletes
            </label>
            <textarea
              id="roster-paste"
              className="input mt-1.5 !min-h-20 font-mono text-[13px]"
              placeholder={`29kim.student@${SCHOOL_DOMAIN}\n28lee.student@${SCHOOL_DOMAIN}`}
              value={paste}
              onChange={(e) => setPaste(e.target.value)}
            />
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs faint">Paste one or many — new lines, commas or spaces all work. They don’t need to have signed in yet.</span>
              <button type="button" className="btn btn-primary btn-sm" disabled={busy || !paste.trim()} onClick={() => void add()}>
                {busy ? 'Adding…' : 'Add to roster'}
              </button>
            </div>
            {warning && (
              <div className="mt-3">
                <Notice>{warning}</Notice>
              </div>
            )}
          </div>

          {roster.length === 0 ? (
            <p className="mt-6 text-sm faint">Nobody on this roster yet.</p>
          ) : (
            <ul className="mt-5 divide-y divide-[var(--line)]">
              {roster.map((r) => {
                const p = people.get(r.email)
                return (
                  <li key={r.email} className="flex items-center gap-3 py-2.5">
                    <Avatar name={p?.full_name || r.email} url={p?.avatar_url} size={34} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold">
                        {p?.full_name || <span className="font-normal muted">Hasn’t signed in yet</span>}
                        {p?.grade && <span className="ml-2 text-xs font-normal muted">Gr {p.grade}</span>}
                      </p>
                      <p className="truncate text-xs muted">{r.email}</p>
                    </div>
                    <button type="button" className="icon-btn" onClick={() => void remove(r.email)} aria-label={`Remove ${r.email}`}>
                      ✕
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </section>
      )}
    </div>
  )
}
