import { useState } from 'react'
import type { FormEvent } from 'react'
import { useData } from '../../context/DataContext'
import { supabase } from '../../lib/supabase'
import type { Athlete, QA } from '../../lib/types'
import { Field, Modal, Notice, useToast } from '../ui'
import ImageField from './ImageField'
import MarkdownField from './MarkdownField'

type Draft = Omit<Athlete, 'id'>

const QUESTION_IDEAS = [
  'Pre-game ritual?',
  'Walk-up song?',
  'Best moment in a GCS jersey?',
  'Who taught you the most?',
  'Advice for someone trying out?',
  'Favorite post-game food?',
]

export default function AthleteForm({
  athlete,
  onClose,
  onSaved,
}: {
  athlete?: Athlete
  onClose: () => void
  onSaved: (deleted?: boolean) => void
}) {
  const { sports } = useData()
  const toast = useToast()
  const [d, setD] = useState<Draft>(
    () =>
      athlete ?? {
        full_name: '',
        grade: null,
        headline: '',
        sport_ids: [],
        photo_url: null,
        quote: '',
        bio: '',
        qa: [],
        jersey: '',
        featured: false,
        published: true,
        sort_order: 100,
      },
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((p) => ({ ...p, [k]: v }))
  const setQA = (i: number, patch: Partial<QA>) => set('qa', d.qa.map((x, j) => (j === i ? { ...x, ...patch } : x)))

  async function save(e: FormEvent) {
    e.preventDefault()
    if (!d.full_name.trim()) return setError('Add their name.')
    setBusy(true)
    const row = { ...d, full_name: d.full_name.trim(), qa: d.qa.filter((x) => x.q.trim() && x.a.trim()) }
    const { error: err } = athlete
      ? await supabase.from('athletes').update(row).eq('id', athlete.id)
      : await supabase.from('athletes').insert(row)
    setBusy(false)
    if (err) return setError(err.message)
    toast(athlete ? 'Saved' : 'Athlete added')
    onSaved()
    onClose()
  }

  async function remove() {
    if (!athlete || !window.confirm(`Remove ${athlete.full_name}’s spotlight?`)) return
    setBusy(true)
    const { error: err } = await supabase.from('athletes').delete().eq('id', athlete.id)
    setBusy(false)
    if (err) return setError(err.message)
    toast('Removed')
    onSaved(true)
    onClose()
  }

  const unusedIdeas = QUESTION_IDEAS.filter((q) => !d.qa.some((x) => x.q === q))

  return (
    <Modal
      title={athlete ? `Edit ${athlete.full_name}` : 'New athlete spotlight'}
      onClose={onClose}
      footer={
        <>
          {athlete && (
            <button type="button" className="btn btn-danger btn-sm mr-auto" disabled={busy} onClick={() => void remove()}>
              Remove
            </button>
          )}
          <button type="button" className="btn btn-quiet" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" form="athlete-form" className="btn btn-primary" disabled={busy}>
            {busy ? 'Saving…' : 'Save'}
          </button>
        </>
      }
    >
      <form id="athlete-form" onSubmit={(e) => void save(e)} className="grid gap-5">
        {error && <Notice tone="error">{error}</Notice>}
        <Notice>Get the student’s OK before posting their photo and story. Spotlights are visible only to signed-in students, staff and verified parents.</Notice>

        <div className="grid gap-5 sm:grid-cols-[180px_1fr]">
          <ImageField label="Photo" value={d.photo_url} onChange={(v) => set('photo_url', v)} folder="athletes" aspect="aspect-[3/4]" />
          <div className="grid content-start gap-4">
            <Field label="Name">
              <input className="input" value={d.full_name} onChange={(e) => set('full_name', e.target.value)} autoFocus />
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Grade">
                <input type="number" min={1} max={12} className="input" value={d.grade ?? ''} onChange={(e) => set('grade', e.target.value ? Number(e.target.value) : null)} />
              </Field>
              <Field label="Jersey #">
                <input className="input" value={d.jersey ?? ''} onChange={(e) => set('jersey', e.target.value)} maxLength={3} />
              </Field>
            </div>
            <Field label="Headline">
              <input className="input" value={d.headline ?? ''} onChange={(e) => set('headline', e.target.value)} placeholder="Captain · Varsity Soccer" />
            </Field>
          </div>
        </div>

        <div className="field">
          <span className="label">Sports</span>
          <div className="flex flex-wrap gap-1.5">
            {sports.map((s) => {
              const on = d.sport_ids.includes(s.id)
              return (
                <button
                  key={s.id}
                  type="button"
                  className="chip"
                  aria-pressed={on}
                  onClick={() => set('sport_ids', on ? d.sport_ids.filter((x) => x !== s.id) : [...d.sport_ids, s.id])}
                >
                  {s.emoji} {s.name}
                </button>
              )
            })}
          </div>
        </div>

        <Field label="Pull quote">
          <input className="input" value={d.quote ?? ''} onChange={(e) => set('quote', e.target.value)} placeholder="One line in their own words" />
        </Field>

        <MarkdownField label="Their story" value={d.bio} onChange={(v) => set('bio', v)} />

        <div className="field">
          <span className="label">Q&amp;A</span>
          <div className="grid gap-3">
            {d.qa.map((item, i) => (
              <div key={i} className="grid gap-2 rounded-xl border hairline p-3 sm:grid-cols-[1fr_1.4fr_auto]">
                <input className="input" value={item.q} onChange={(e) => setQA(i, { q: e.target.value })} placeholder="Question" />
                <input className="input" value={item.a} onChange={(e) => setQA(i, { a: e.target.value })} placeholder="Answer" />
                <button type="button" className="icon-btn" onClick={() => set('qa', d.qa.filter((_, j) => j !== i))} aria-label="Remove question">
                  ✕
                </button>
              </div>
            ))}
            <div className="flex flex-wrap gap-1.5">
              <button type="button" className="chip" onClick={() => set('qa', [...d.qa, { q: '', a: '' }])}>
                + Question
              </button>
              {unusedIdeas.slice(0, 4).map((q) => (
                <button key={q} type="button" className="chip border-dashed" onClick={() => set('qa', [...d.qa, { q, a: '' }])}>
                  + {q}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <label className="check">
            <input type="checkbox" checked={d.featured} onChange={(e) => set('featured', e.target.checked)} />
            Featured on the home page
          </label>
          <label className="check">
            <input type="checkbox" checked={d.published} onChange={(e) => set('published', e.target.checked)} />
            Published
          </label>
          <label className="check">
            Order
            <input type="number" className="input !w-20 !py-1.5" value={d.sort_order} onChange={(e) => set('sort_order', Number(e.target.value) || 0)} />
          </label>
        </div>
      </form>
    </Modal>
  )
}
