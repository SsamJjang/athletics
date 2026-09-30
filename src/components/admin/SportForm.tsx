import { useState } from 'react'
import type { FormEvent } from 'react'
import { SEASONS, SPORT_COLORS } from '../../lib/meta'
import { supabase } from '../../lib/supabase'
import type { Season, Sport, Tier } from '../../lib/types'
import { Field, Modal, Notice, useToast } from '../ui'
import ImageField from './ImageField'
import MarkdownField from './MarkdownField'

type Draft = Omit<Sport, 'id'>

const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

export default function SportForm({
  sport,
  onClose,
  onSaved,
}: {
  sport?: Sport
  onClose: () => void
  /** Called with the saved row, or null after a delete. */
  onSaved: (saved: Sport | null) => void
}) {
  const toast = useToast()
  const [d, setD] = useState<Draft>(
    () =>
      sport ?? {
        slug: '',
        name: '',
        season: 'fall',
        tier: 'team',
        divisions: '',
        emoji: '🏅',
        color: SPORT_COLORS[0],
        summary: '',
        body: '',
        coach: '',
        practice_info: '',
        how_to_join: '',
        cover_url: null,
        sort_order: 100,
        active: true,
      },
  )
  const [slugTouched, setSlugTouched] = useState(Boolean(sport))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((p) => ({ ...p, [k]: v }))

  async function save(e: FormEvent) {
    e.preventDefault()
    if (!d.name.trim()) return setError('Name it.')
    const slug = slugify(d.slug || d.name)
    if (!slug) return setError('The web address needs letters or numbers.')
    setBusy(true)
    const row = { ...d, slug, name: d.name.trim() }
    const { data, error: err } = sport
      ? await supabase.from('sports').update(row).eq('id', sport.id).select().single()
      : await supabase.from('sports').insert(row).select().single()
    setBusy(false)
    if (err) return setError(err.code === '23505' ? 'Another sport already uses that web address.' : err.message)
    toast(sport ? 'Sport updated' : 'Sport added')
    onSaved(data as Sport)
    onClose()
  }

  async function remove() {
    if (!sport) return
    if (!window.confirm(`Delete ${sport.name}? Its events stay on the calendar but lose their sport. Tip: untick “Visible” to hide it instead.`)) return
    setBusy(true)
    const { error: err } = await supabase.from('sports').delete().eq('id', sport.id)
    setBusy(false)
    if (err) return setError(err.message)
    toast('Deleted')
    onSaved(null)
    onClose()
  }

  return (
    <Modal
      title={sport ? `Edit ${sport.name}` : 'New sport'}
      onClose={onClose}
      footer={
        <>
          {sport && (
            <button type="button" className="btn btn-danger btn-sm mr-auto" disabled={busy} onClick={() => void remove()}>
              Delete
            </button>
          )}
          <button type="button" className="btn btn-quiet" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" form="sport-form" className="btn btn-primary" disabled={busy}>
            {busy ? 'Saving…' : 'Save'}
          </button>
        </>
      }
    >
      <form id="sport-form" onSubmit={(e) => void save(e)} className="grid gap-5">
        {error && <Notice tone="error">{error}</Notice>}

        <div className="grid gap-4 sm:grid-cols-[80px_1fr]">
          <Field label="Emoji">
            <input className="input text-center text-2xl" value={d.emoji ?? ''} onChange={(e) => set('emoji', e.target.value)} maxLength={4} />
          </Field>
          <Field label="Name">
            <input
              className="input"
              value={d.name}
              onChange={(e) => {
                set('name', e.target.value)
                if (!slugTouched) set('slug', slugify(e.target.value))
              }}
              autoFocus
            />
          </Field>
        </div>

        <Field label="Web address" hint={`${window.location.origin}/sports/${slugify(d.slug || d.name) || '…'}`}>
          <input
            className="input"
            value={d.slug}
            onChange={(e) => {
              setSlugTouched(true)
              set('slug', e.target.value)
            }}
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="field">
            <span className="label">Season</span>
            <div className="segmented flex-wrap">
              {SEASONS.map((s) => (
                <button key={s.id} type="button" aria-pressed={d.season === s.id} onClick={() => set('season', s.id as Season)}>
                  {s.label}
                </button>
              ))}
            </div>
          </div>
          <div className="field">
            <span className="label">Kind</span>
            <div className="segmented">
              {(
                [
                  ['team', 'School team'],
                  ['opportunity', 'Opportunity'],
                ] as [Tier, string][]
              ).map(([id, label]) => (
                <button key={id} type="button" aria-pressed={d.tier === id} onClick={() => set('tier', id)}>
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="field">
          <span className="label">Color</span>
          <div className="flex flex-wrap items-center gap-2">
            {SPORT_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={c}
                onClick={() => set('color', c)}
                className="size-8 rounded-full transition hover:scale-110"
                style={{ background: c, boxShadow: d.color.toLowerCase() === c.toLowerCase() ? `0 0 0 3px var(--surface), 0 0 0 5px ${c}` : undefined }}
              />
            ))}
            <input type="color" value={d.color} onChange={(e) => set('color', e.target.value)} className="size-8 cursor-pointer rounded-full border-0 bg-transparent" aria-label="Custom color" />
          </div>
        </div>

        <Field label="One-line summary">
          <input className="input" value={d.summary ?? ''} onChange={(e) => set('summary', e.target.value)} maxLength={160} />
        </Field>

        <ImageField label="Cover photo (optional)" value={d.cover_url} onChange={(v) => set('cover_url', v)} folder="sports" />

        <MarkdownField label="About this sport" value={d.body} onChange={(v) => set('body', v)} />

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Teams / divisions">
            <input className="input" value={d.divisions ?? ''} onChange={(e) => set('divisions', e.target.value)} placeholder="Varsity Boys · Varsity Girls" />
          </Field>
          <Field label="Coach">
            <input className="input" value={d.coach ?? ''} onChange={(e) => set('coach', e.target.value)} />
          </Field>
          <Field label="Practice">
            <input className="input" value={d.practice_info ?? ''} onChange={(e) => set('practice_info', e.target.value)} placeholder="Mon · Wed after school" />
          </Field>
          <Field label="Order" hint="Lower numbers show first.">
            <input type="number" className="input" value={d.sort_order} onChange={(e) => set('sort_order', Number(e.target.value) || 0)} />
          </Field>
        </div>

        <Field label="How to join">
          <textarea className="input !min-h-20" value={d.how_to_join ?? ''} onChange={(e) => set('how_to_join', e.target.value)} />
        </Field>

        <label className="check">
          <input type="checkbox" checked={d.active} onChange={(e) => set('active', e.target.checked)} />
          Visible on the site
        </label>
      </form>
    </Modal>
  )
}
