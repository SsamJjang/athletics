import { useCallback, useEffect, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useData } from '../context/DataContext'
import { dayKey, fmtDate, relative } from '../lib/dates'
import { supabase } from '../lib/supabase'
import type { GEvent, ParentInvite, ParentLink, Profile } from '../lib/types'
import { Avatar, Notice, PageHeader, Spinner, useToast } from '../components/ui'
import { EventRow } from './Calendar'

/** Name (and grade, for students) — the only profile fields anyone edits. */
export function NameCard() {
  const { session, profile, refresh } = useAuth()
  const toast = useToast()
  const [name, setName] = useState(profile?.full_name ?? '')
  const [grade, setGrade] = useState(profile?.grade?.toString() ?? '')
  const [busy, setBusy] = useState(false)
  const dirty = name !== (profile?.full_name ?? '') || grade !== (profile?.grade?.toString() ?? '')

  async function save() {
    if (!session) return
    setBusy(true)
    const { error } = await supabase
      .from('profiles')
      .update({ full_name: name.trim(), grade: grade ? Number(grade) : null })
      .eq('id', session.user.id)
    setBusy(false)
    toast(error ? 'Could not save' : 'Saved')
    await refresh()
  }

  return (
    <section className="card p-6">
      <p className="eyebrow">Your name</p>
      <div className={`mt-3 grid gap-3 ${profile?.kind === 'school' ? 'sm:grid-cols-[1fr_120px_auto]' : 'sm:grid-cols-[1fr_auto]'}`}>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" aria-label="Full name" />
        {profile?.kind === 'school' && (
          <input type="number" min={1} max={12} className="input" value={grade} onChange={(e) => setGrade(e.target.value)} placeholder="Grade" aria-label="Grade" />
        )}
        <button type="button" className="btn btn-ink" disabled={!dirty || busy || !name.trim()} onClick={() => void save()}>
          Save
        </button>
      </div>
    </section>
  )
}

type LinkRow = ParentLink & { parent: Pick<Profile, 'full_name' | 'email' | 'avatar_url'> | null }

function FamilyCodes() {
  const { session } = useAuth()
  const toast = useToast()
  const [invites, setInvites] = useState<ParentInvite[]>([])
  const [links, setLinks] = useState<LinkRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    if (!session) return
    const [inv, lnk] = await Promise.all([
      supabase
        .from('parent_invites')
        .select('*')
        .eq('student_id', session.user.id)
        .is('used_at', null)
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false }),
      supabase
        .from('parent_links')
        .select('*, parent:profiles!parent_links_parent_id_fkey(full_name,email,avatar_url)')
        .eq('student_id', session.user.id),
    ])
    setInvites((inv.data as ParentInvite[]) ?? [])
    setLinks((lnk.data as LinkRow[]) ?? [])
  }, [session])

  useEffect(() => {
    void load()
  }, [load])

  async function create() {
    setBusy(true)
    setError(null)
    const { error: err } = await supabase.rpc('create_parent_invite')
    setBusy(false)
    if (err) setError(err.message.replace(/^[a-z_]+: /, ''))
    await load()
  }

  async function revokeInvite(code: string) {
    await supabase.from('parent_invites').delete().eq('code', code)
    await load()
  }

  async function removeParent(l: LinkRow) {
    if (!session || !window.confirm(`Remove ${l.parent?.full_name || l.parent?.email}? They’ll lose access to your sign-ups.`)) return
    await supabase.from('parent_links').delete().eq('parent_id', l.parent_id).eq('student_id', session.user.id)
    toast('Removed')
    await load()
  }

  const pretty = (c: string) => `${c.slice(0, 4)}-${c.slice(4)}`

  return (
    <section className="card overflow-hidden">
      <div className="stage bg-ink p-6 text-paper">
        <p className="eyebrow !text-volt">Family</p>
        <h2 className="display mt-1 text-3xl">Link a parent</h2>
        <p className="mt-2 max-w-lg text-sm text-paper/70">
          Parents sign in with their own account, then enter a code from you. It’s how the site knows they’re really your family. Only give codes to your parents or guardians.
        </p>
      </div>
      <div className="grid gap-6 p-6">
        {error && <Notice tone="error">{error}</Notice>}

        <div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="font-semibold">Codes waiting to be used</p>
            <button type="button" className="btn btn-primary btn-sm" onClick={() => void create()} disabled={busy || invites.length >= 3}>
              + New code
            </button>
          </div>
          {invites.length === 0 ? (
            <p className="mt-2 text-sm faint">No active codes.</p>
          ) : (
            <ul className="mt-3 grid gap-2">
              {invites.map((i) => (
                <li key={i.code} className="flex flex-wrap items-center gap-3 rounded-xl border-2 border-dashed border-[var(--line-strong)] p-3">
                  <span className="num font-mono text-2xl font-bold tracking-[0.2em]">{pretty(i.code)}</span>
                  <span className="text-xs muted">expires {relative(i.expires_at)}</span>
                  <span className="ml-auto flex gap-1">
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => {
                        void navigator.clipboard?.writeText(
                          `Here's my GCS Athletics family code: ${pretty(i.code)}\nSign in as a parent at ${window.location.origin}/login?as=parent and enter it on "My family".`,
                        )
                        toast('Copied — send it to your parent')
                      }}
                    >
                      Copy
                    </button>
                    <button type="button" className="btn btn-quiet btn-sm" onClick={() => void revokeInvite(i.code)}>
                      Revoke
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          <p className="font-semibold">Linked parents</p>
          {links === null ? (
            <Spinner />
          ) : links.length === 0 ? (
            <p className="mt-2 text-sm faint">None yet.</p>
          ) : (
            <ul className="mt-2 divide-y divide-[var(--line)]">
              {links.map((l) => (
                <li key={l.parent_id} className="flex items-center gap-3 py-3">
                  <Avatar name={l.parent?.full_name || l.parent?.email || '?'} url={l.parent?.avatar_url} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">
                      {l.parent?.full_name || 'No name set'} <span className="font-normal muted">· {l.relationship}</span>
                    </p>
                    <p className="truncate text-xs muted">
                      {l.parent?.email} · since {fmtDate(l.created_at)}
                    </p>
                  </div>
                  <button type="button" className="btn btn-quiet btn-sm" onClick={() => void removeParent(l)}>
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 text-xs faint">Don’t recognise someone here? Remove them and tell a StuCo AD.</p>
        </div>
      </div>
    </section>
  )
}

export default function Me() {
  const { session, profile, loading } = useAuth()
  const { sports, follows, toggleFollow } = useData()
  const navigate = useNavigate()
  const [mine, setMine] = useState<GEvent[] | null>(null)

  useEffect(() => {
    if (!session) return
    void supabase
      .from('event_signups')
      .select('event:events(*)')
      .eq('user_id', session.user.id)
      .then(({ data }) => {
        const now = new Date()
        const list = ((data ?? []) as unknown as { event: GEvent | null }[])
          .map((r) => r.event)
          .filter((e): e is GEvent => Boolean(e) && new Date(e!.ends_at ?? e!.starts_at) >= now)
          .sort((a, b) => a.starts_at.localeCompare(b.starts_at))
        setMine(list)
      })
  }, [session])

  if (loading) return <Spinner />
  if (!session) return <Navigate to="/login" replace />
  if (profile?.kind === 'parent') return <Navigate to="/family" replace />

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader eyebrow={profile?.email} title={profile?.full_name ? `Hey, ${profile.full_name.split(' ')[0]}` : 'My page'} />
      <div className="grid gap-6">
        <section className="card p-6">
          <p className="eyebrow">You’re signed up for</p>
          <div className="mt-4 divide-y divide-[var(--line)]">
            {mine === null ? (
              <Spinner />
            ) : mine.length === 0 ? (
              <p className="text-sm faint">Nothing yet. Look for “Sign me up” on tryouts and events in the calendar.</p>
            ) : (
              mine.map((e) => (
                <div key={e.id} className="py-2.5 first:pt-0">
                  <EventRow event={e} showDate onOpen={() => navigate(`/calendar?event=${e.id}&d=${dayKey(new Date(e.starts_at))}`)} />
                </div>
              ))
            )}
          </div>
        </section>

        <section className="card p-6">
          <p className="eyebrow">Teams I follow</p>
          <p className="mt-1 text-sm muted">Followed sports power the “My teams” filter on the calendar.</p>
          <div className="mt-4 flex flex-wrap gap-1.5">
            {sports.map((s) => (
              <button
                key={s.id}
                type="button"
                className="chip"
                aria-pressed={follows.has(s.id)}
                onClick={() => void toggleFollow(s.id)}
                style={follows.has(s.id) ? { background: s.color, borderColor: s.color, color: '#fff' } : undefined}
              >
                {s.emoji} {s.name}
              </button>
            ))}
          </div>
        </section>

        <FamilyCodes />
        <NameCard />
      </div>
    </div>
  )
}

