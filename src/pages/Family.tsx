import { useCallback, useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useData } from '../context/DataContext'
import { dayKey, fmtDate } from '../lib/dates'
import { supabase } from '../lib/supabase'
import type { GEvent, ParentLink, Profile } from '../lib/types'
import { Avatar, Notice, PageHeader, Spinner, useToast } from '../components/ui'
import { EventRow } from './Calendar'
import { NameCard } from './Me'

const RELATIONSHIPS = ['Mother', 'Father', 'Guardian', 'Grandparent', 'Other']

const ERRORS: Record<string, string> = {
  invalid_code: 'That code isn’t valid. Codes are single-use and expire after 7 days — ask for a fresh one.',
  too_many_attempts: 'Too many wrong codes. Wait an hour and try again.',
  student_full: 'That student already has the maximum number of linked parents. They can remove one from their page.',
  not_signed_in: 'Your session expired. Sign in again.',
}

/** Formats as XXXX-XXXX while typing. */
function formatCode(raw: string) {
  const clean = raw.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8)
  return clean.length > 4 ? `${clean.slice(0, 4)}-${clean.slice(4)}` : clean
}

export function RedeemCard({ onDone, compact = false }: { onDone: () => void; compact?: boolean }) {
  const toast = useToast()
  const [code, setCode] = useState('')
  const [relationship, setRelationship] = useState('Mother')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const { data, error: err } = await supabase.rpc('redeem_parent_invite', { p_code: code, p_relationship: relationship })
    setBusy(false)
    const res = data as { ok: boolean; error?: string; student_name?: string } | null
    if (err || !res?.ok) return setError(ERRORS[res?.error ?? ''] ?? err?.message ?? 'Something went wrong.')
    toast(`Linked to ${res.student_name || 'your child'} ✓`)
    setCode('')
    onDone()
  }

  return (
    <form onSubmit={(e) => void submit(e)} className={`card ${compact ? 'p-5' : 'p-6 sm:p-8'}`}>
      {!compact && (
        <>
          <p className="eyebrow">Verify</p>
          <h2 className="display mt-1 text-4xl">Enter your family code</h2>
          <p className="mt-2 max-w-md text-sm muted">
            Your child creates this on their GCS account (<b>My page → Family</b>). It proves you’re connected to a real GCS student, and links your account to theirs.
          </p>
        </>
      )}
      {compact && <p className="font-semibold">Add another child</p>}
      <div className={`grid gap-3 ${compact ? 'mt-3' : 'mt-6'} sm:grid-cols-[1fr_150px]`}>
        <input
          className="input num text-center text-2xl font-bold tracking-[0.25em] uppercase"
          placeholder="XXXX-XXXX"
          value={code}
          onChange={(e) => setCode(formatCode(e.target.value))}
          aria-label="Family code"
          autoComplete="off"
          spellCheck={false}
        />
        <select className="input" value={relationship} onChange={(e) => setRelationship(e.target.value)} aria-label="Relationship">
          {RELATIONSHIPS.map((r) => (
            <option key={r}>{r}</option>
          ))}
        </select>
      </div>
      {error && (
        <div className="mt-3">
          <Notice tone="error">{error}</Notice>
        </div>
      )}
      <button type="submit" className="btn btn-primary mt-4 w-full sm:w-auto" disabled={busy || code.replace('-', '').length !== 8}>
        {busy ? 'Checking…' : 'Verify & link'}
      </button>
    </form>
  )
}

export default function Family() {
  const { session, profile, access, loading, refresh } = useAuth()
  const { sportById } = useData()
  const navigate = useNavigate()
  const [children, setChildren] = useState<(ParentLink & { student: Pick<Profile, 'id' | 'full_name' | 'email' | 'avatar_url' | 'grade'> | null })[] | null>(null)
  const [events, setEvents] = useState<(GEvent & { who: string[] })[]>([])

  const load = useCallback(async () => {
    if (!session) return
    const { data } = await supabase
      .from('parent_links')
      .select('*, student:profiles!parent_links_student_id_fkey(id,full_name,email,avatar_url,grade)')
      .eq('parent_id', session.user.id)
    const kids = (data as typeof children) ?? []
    setChildren(kids)

    // Upcoming things the kids signed up for.
    const ids = kids.map((k) => k.student_id)
    if (!ids.length) return setEvents([])
    const { data: signups } = await supabase
      .from('event_signups')
      .select('user_id, event:events(*)')
      .in('user_id', ids)
    const now = new Date()
    const byEvent = new Map<string, GEvent & { who: string[] }>()
    for (const row of (signups ?? []) as unknown as { user_id: string; event: GEvent | null }[]) {
      if (!row.event || new Date(row.event.ends_at ?? row.event.starts_at) < now) continue
      const name = kids.find((k) => k.student_id === row.user_id)?.student?.full_name?.split(' ')[0] ?? 'Child'
      const cur = byEvent.get(row.event.id) ?? { ...row.event, who: [] }
      cur.who.push(name)
      byEvent.set(row.event.id, cur)
    }
    setEvents([...byEvent.values()].sort((a, b) => a.starts_at.localeCompare(b.starts_at)))
  }, [session])

  useEffect(() => {
    void load()
  }, [load])

  if (loading) return <Spinner />
  if (!session) return <Navigate to="/login?as=parent" replace />
  if (profile?.kind === 'school') return <Navigate to="/me" replace />

  async function unlink(studentId: string, name: string) {
    if (!session || !window.confirm(`Unlink from ${name}? You’ll need a new code to link again.`)) return
    await supabase.from('parent_links').delete().eq('parent_id', session.user.id).eq('student_id', studentId)
    await load()
    await refresh()
  }

  const verified = access.is_verified_parent

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader eyebrow="Parent account" title="My family">
        {verified
          ? 'You’re verified. You can see everything on the site, including athlete spotlights and your children’s sign-ups.'
          : 'You can browse the public calendar now. Verify to see athlete spotlights, members-only events, and your child’s sign-ups.'}
      </PageHeader>

      <div className="grid gap-6">
        {!profile?.full_name && <NameCard />}

        {!verified && (
          <>
            <RedeemCard
              onDone={() => {
                void load()
                void refresh()
              }}
            />
            <Notice>
              <b>No GCS student at home can make a code?</b> Contact a Student Council AD or the athletics office — an admin can verify your account directly.
            </Notice>
          </>
        )}

        {children === null ? (
          <Spinner />
        ) : (
          children.length > 0 && (
            <section className="card p-6">
              <p className="eyebrow">Linked students</p>
              <ul className="mt-4 divide-y divide-[var(--line)]">
                {children.map((c) => (
                  <li key={c.student_id} className="flex items-center gap-3 py-3">
                    <Avatar name={c.student?.full_name || c.student?.email || '?'} url={c.student?.avatar_url} size={40} />
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold">{c.student?.full_name || c.student?.email}</p>
                      <p className="text-xs muted">
                        You’re their {c.relationship.toLowerCase()} · linked {fmtDate(c.created_at)}
                      </p>
                    </div>
                    <button type="button" className="btn btn-quiet btn-sm" onClick={() => void unlink(c.student_id, c.student?.full_name || 'this student')}>
                      Unlink
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )
        )}

        {verified && (
          <section className="card p-6">
            <p className="eyebrow">Signed up</p>
            <h2 className="display mt-1 text-3xl">What your kids are in</h2>
            <div className="mt-4 divide-y divide-[var(--line)]">
              {events.length === 0 ? (
                <p className="text-sm faint">No upcoming sign-ups.</p>
              ) : (
                events.map((e) => (
                  <div key={e.id} className="flex items-center gap-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <EventRow event={e} showDate onOpen={() => navigate(`/calendar?event=${e.id}&d=${dayKey(new Date(e.starts_at))}`)} />
                    </div>
                    <span className="tag bg-surface-2">{e.who.join(', ')}</span>
                  </div>
                ))
              )}
            </div>
            <p className="mt-4 text-xs faint">
              {sportById.size > 0 && (
                <>
                  Your child’s teams already show on the calendar. To get everything in your own calendar app, use “Add to Google Calendar” on the <Link to="/calendar" className="underline">calendar page</Link>.
                </>
              )}
            </p>
          </section>
        )}

        {verified && children && children.length > 0 && (
          <RedeemCard
            compact
            onDone={() => {
              void load()
              void refresh()
            }}
          />
        )}
      </div>
    </div>
  )
}
