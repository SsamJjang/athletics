import { useState } from 'react'
import type { FormEvent } from 'react'
import { useAuth } from '../../context/AuthContext'
import { useData } from '../../context/DataContext'
import { addDays, fromLocalInput, toLocalInput } from '../../lib/dates'
import { EVENT_KINDS } from '../../lib/meta'
import { supabase } from '../../lib/supabase'
import type { EventKind, GEvent, HomeAway, Outcome } from '../../lib/types'
import { Field, Modal, Notice, useToast } from '../ui'
import MarkdownField from './MarkdownField'

type Draft = Omit<GEvent, 'id' | 'series_id' | 'created_at'>

function blank(day?: Date): Draft {
  const start = day ? new Date(day) : new Date()
  start.setHours(15, 30, 0, 0)
  const end = new Date(start)
  end.setHours(17, 0, 0, 0)
  return {
    title: '',
    kind: 'game',
    sport_id: null,
    starts_at: start.toISOString(),
    ends_at: end.toISOString(),
    all_day: false,
    location: '',
    opponent: '',
    home_away: null,
    description: '',
    signup_enabled: false,
    signup_deadline: null,
    capacity: null,
    result: '',
    outcome: null,
    members_only: false,
    cancelled: false,
  }
}

/** Date part of an ISO string as yyyy-mm-dd, for all-day inputs. */
const dateOnly = (iso: string | null) => (iso ? toLocalInput(iso).slice(0, 10) : '')

export default function EventForm({
  event,
  defaultDay,
  onClose,
  onSaved,
}: {
  event?: GEvent | null
  defaultDay?: Date
  onClose: () => void
  onSaved: () => void
}) {
  const { session } = useAuth()
  const { sports } = useData()
  const toast = useToast()
  const [d, setD] = useState<Draft>(() => (event ? { ...event } : blank(defaultDay)))
  const [repeatUntil, setRepeatUntil] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((prev) => ({ ...prev, [k]: v }))

  const isGame = d.kind === 'game' || d.kind === 'tournament'

  async function save(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (!d.title.trim()) return setError('Give it a title.')
    if (d.ends_at && new Date(d.ends_at) < new Date(d.starts_at)) return setError('It ends before it starts.')
    setBusy(true)

    const row = {
      ...d,
      title: d.title.trim(),
      location: d.location?.trim() || null,
      opponent: isGame ? d.opponent?.trim() || null : null,
      home_away: isGame ? d.home_away : null,
      result: d.result?.trim() || null,
      outcome: d.outcome || null,
      signup_deadline: d.signup_enabled ? d.signup_deadline : null,
      capacity: d.signup_enabled ? d.capacity : null,
    }

    let err
    if (event) {
      ;({ error: err } = await supabase.from('events').update(row).eq('id', event.id))
    } else {
      // Weekly repeat → one row per week sharing a series id, so a single
      // week can later be moved or cancelled on its own.
      const rows = [{ ...row, created_by: session?.user.id ?? null }]
      if (repeatUntil) {
        const series = crypto.randomUUID()
        rows[0] = { ...rows[0], series_id: series } as typeof rows[0]
        const until = new Date(`${repeatUntil}T23:59:59`)
        const span = row.ends_at ? new Date(row.ends_at).getTime() - new Date(row.starts_at).getTime() : null
        for (let w = 1; w < 60; w++) {
          const s = addDays(new Date(row.starts_at), 7 * w)
          if (s > until) break
          const deadlineShift = row.signup_deadline ? addDays(new Date(row.signup_deadline), 7 * w).toISOString() : null
          rows.push({
            ...rows[0],
            starts_at: s.toISOString(),
            ends_at: span != null ? new Date(s.getTime() + span).toISOString() : null,
            signup_deadline: deadlineShift,
          })
        }
      }
      ;({ error: err } = await supabase.from('events').insert(rows))
      if (!err && rows.length > 1) toast(`Created ${rows.length} weekly events`)
    }

    setBusy(false)
    if (err) return setError(err.message)
    if (event || !repeatUntil) toast(event ? 'Event updated' : 'Event created')
    onSaved()
    onClose()
  }

  async function remove(series: boolean) {
    if (!event) return
    const what = series ? 'every event in this series' : `“${event.title}”`
    if (!window.confirm(`Delete ${what}? Sign-ups for it are deleted too.`)) return
    setBusy(true)
    const q = supabase.from('events').delete()
    const { error: err } = series && event.series_id ? await q.eq('series_id', event.series_id) : await q.eq('id', event.id)
    setBusy(false)
    if (err) return setError(err.message)
    toast('Deleted')
    onSaved()
    onClose()
  }

  return (
    <Modal
      title={event ? 'Edit event' : 'New event'}
      onClose={onClose}
      footer={
        <>
          {event && (
            <div className="mr-auto flex gap-2">
              <button type="button" className="btn btn-danger btn-sm" disabled={busy} onClick={() => void remove(false)}>
                Delete
              </button>
              {event.series_id && (
                <button type="button" className="btn btn-danger btn-sm" disabled={busy} onClick={() => void remove(true)}>
                  Delete series
                </button>
              )}
            </div>
          )}
          <button type="button" className="btn btn-quiet" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" form="event-form" className="btn btn-primary" disabled={busy}>
            {busy ? 'Saving…' : 'Save'}
          </button>
        </>
      }
    >
      <form id="event-form" onSubmit={(e) => void save(e)} className="grid gap-5">
        {error && <Notice tone="error">{error}</Notice>}

        <div>
          <span className="label">Type</span>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {EVENT_KINDS.map((k) => (
              <button
                key={k.id}
                type="button"
                className="chip"
                aria-pressed={d.kind === k.id}
                onClick={() => {
                  set('kind', k.id as EventKind)
                  if (k.id === 'deadline') set('all_day', false)
                }}
              >
                <span className="dot" style={{ ['--pill' as string]: k.color }} />
                {k.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-[1fr_200px]">
          <Field label="Title">
            <input className="input" value={d.title} onChange={(e) => set('title', e.target.value)} placeholder={d.kind === 'deadline' ? 'Basketball tryout sign-up closes' : 'Varsity vs. …'} autoFocus />
          </Field>
          <Field label="Sport">
            <select className="input" value={d.sport_id ?? ''} onChange={(e) => set('sport_id', e.target.value || null)}>
              <option value="">All / general</option>
              {sports.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.emoji} {s.name}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <label className="check">
          <input type="checkbox" checked={d.all_day} onChange={(e) => set('all_day', e.target.checked)} />
          All day
        </label>

        <div className="grid gap-4 sm:grid-cols-2">
          {d.all_day ? (
            <>
              <Field label="Starts">
                <input
                  type="date"
                  className="input"
                  value={dateOnly(d.starts_at)}
                  onChange={(e) => e.target.value && set('starts_at', new Date(`${e.target.value}T00:00`).toISOString())}
                  required
                />
              </Field>
              <Field label="Ends (optional)">
                <input
                  type="date"
                  className="input"
                  value={dateOnly(d.ends_at)}
                  onChange={(e) => set('ends_at', e.target.value ? new Date(`${e.target.value}T23:59`).toISOString() : null)}
                />
              </Field>
            </>
          ) : (
            <>
              <Field label={d.kind === 'deadline' ? 'Deadline' : 'Starts'}>
                <input
                  type="datetime-local"
                  className="input"
                  value={toLocalInput(d.starts_at)}
                  onChange={(e) => e.target.value && set('starts_at', fromLocalInput(e.target.value)!)}
                  required
                />
              </Field>
              {d.kind !== 'deadline' && (
                <Field label="Ends (optional)">
                  <input
                    type="datetime-local"
                    className="input"
                    value={toLocalInput(d.ends_at)}
                    onChange={(e) => set('ends_at', fromLocalInput(e.target.value))}
                  />
                </Field>
              )}
            </>
          )}
        </div>

        {!event && (
          <Field label="Repeat weekly until (optional)" hint="For practices. Creates one event per week — each can be edited or cancelled on its own.">
            <input type="date" className="input sm:max-w-xs" value={repeatUntil} onChange={(e) => setRepeatUntil(e.target.value)} />
          </Field>
        )}

        <Field label="Location">
          <input className="input" value={d.location ?? ''} onChange={(e) => set('location', e.target.value)} placeholder="Main gym" />
        </Field>

        {isGame && (
          <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
            <Field label="Opponent">
              <input className="input" value={d.opponent ?? ''} onChange={(e) => set('opponent', e.target.value)} />
            </Field>
            <div className="field">
              <span className="label">Venue</span>
              <div className="segmented">
                {(['home', 'away', 'neutral'] as HomeAway[]).map((h) => (
                  <button key={h} type="button" aria-pressed={d.home_away === h} onClick={() => set('home_away', d.home_away === h ? null : h)} className="capitalize">
                    {h}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        <MarkdownField label="Details" value={d.description} onChange={(v) => set('description', v)} rows={5} />

        <fieldset className="grid gap-4 rounded-2xl border hairline p-4">
          <label className="check font-semibold">
            <input type="checkbox" checked={d.signup_enabled} onChange={(e) => set('signup_enabled', e.target.checked)} />
            Students sign up for this on the site
          </label>
          {d.signup_enabled && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Sign-up closes" hint="Leave empty to close when the event starts.">
                <input
                  type="datetime-local"
                  className="input"
                  value={toLocalInput(d.signup_deadline)}
                  onChange={(e) => set('signup_deadline', fromLocalInput(e.target.value))}
                />
              </Field>
              <Field label="Spots (optional)">
                <input
                  type="number"
                  min={1}
                  className="input"
                  value={d.capacity ?? ''}
                  onChange={(e) => set('capacity', e.target.value ? Math.max(1, Number(e.target.value)) : null)}
                />
              </Field>
            </div>
          )}
        </fieldset>

        {isGame && (
          <fieldset className="grid gap-4 rounded-2xl border hairline p-4 sm:grid-cols-[1fr_auto]">
            <Field label="Result" hint="Fill in after the game — it shows on the home page.">
              <input className="input" value={d.result ?? ''} onChange={(e) => set('result', e.target.value)} placeholder="3 – 1" />
            </Field>
            <div className="field">
              <span className="label">Outcome</span>
              <div className="segmented">
                {(['win', 'loss', 'draw'] as Outcome[]).map((o) => (
                  <button key={o} type="button" aria-pressed={d.outcome === o} onClick={() => set('outcome', d.outcome === o ? null : o)} className="capitalize">
                    {o}
                  </button>
                ))}
              </div>
            </div>
          </fieldset>
        )}

        <div className="flex flex-wrap gap-x-6 gap-y-3">
          <label className="check">
            <input type="checkbox" checked={d.members_only} onChange={(e) => set('members_only', e.target.checked)} />
            Members only <span className="text-xs faint">(hidden from logged-out visitors)</span>
          </label>
          {event && (
            <label className="check">
              <input type="checkbox" checked={d.cancelled} onChange={(e) => set('cancelled', e.target.checked)} />
              Cancelled
            </label>
          )}
        </div>
      </form>
    </Modal>
  )
}
