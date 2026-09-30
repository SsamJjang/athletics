import { useState } from 'react'
import type { FormEvent } from 'react'
import { useAuth } from '../../context/AuthContext'
import { useData } from '../../context/DataContext'
import { supabase } from '../../lib/supabase'
import type { Notice } from '../../lib/types'
import { Field, Modal, Notice as Banner, useToast } from '../ui'
import ImageField from './ImageField'
import MarkdownField from './MarkdownField'

export default function NoticeForm({
  notice,
  onClose,
  onSaved,
}: {
  notice?: Notice
  onClose: () => void
  /** `true` when the notice was deleted. */
  onSaved: (deleted?: boolean) => void
}) {
  const { session } = useAuth()
  const { sports } = useData()
  const toast = useToast()
  const [title, setTitle] = useState(notice?.title ?? '')
  const [body, setBody] = useState(notice?.body ?? '')
  const [sportId, setSportId] = useState(notice?.sport_id ?? '')
  const [cover, setCover] = useState<string | null>(notice?.cover_url ?? null)
  const [pinned, setPinned] = useState(notice?.pinned ?? false)
  const [membersOnly, setMembersOnly] = useState(notice?.members_only ?? false)
  const [published, setPublished] = useState(notice?.published ?? true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save(e: FormEvent) {
    e.preventDefault()
    if (!title.trim()) return setError('Add a title.')
    setBusy(true)
    const row = {
      title: title.trim(),
      body,
      sport_id: sportId || null,
      cover_url: cover,
      pinned,
      members_only: membersOnly,
      published,
    }
    const { error: err } = notice
      ? await supabase.from('notices').update(row).eq('id', notice.id)
      : await supabase.from('notices').insert({ ...row, created_by: session?.user.id ?? null })
    setBusy(false)
    if (err) return setError(err.message)
    toast(notice ? 'Notice updated' : published ? 'Notice posted' : 'Draft saved')
    onSaved()
    onClose()
  }

  async function remove() {
    if (!notice || !window.confirm(`Delete “${notice.title}”?`)) return
    setBusy(true)
    const { error: err } = await supabase.from('notices').delete().eq('id', notice.id)
    setBusy(false)
    if (err) return setError(err.message)
    toast('Deleted')
    onSaved(true)
    onClose()
  }

  return (
    <Modal
      title={notice ? 'Edit notice' : 'New notice'}
      onClose={onClose}
      footer={
        <>
          {notice && (
            <button type="button" className="btn btn-danger btn-sm mr-auto" disabled={busy} onClick={() => void remove()}>
              Delete
            </button>
          )}
          <button type="button" className="btn btn-quiet" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" form="notice-form" className="btn btn-primary" disabled={busy}>
            {busy ? 'Saving…' : published ? (notice ? 'Save' : 'Post') : 'Save draft'}
          </button>
        </>
      }
    >
      <form id="notice-form" onSubmit={(e) => void save(e)} className="grid gap-5">
        {error && <Banner tone="error">{error}</Banner>}
        <Field label="Title">
          <input className="input text-lg font-semibold" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
        </Field>
        <Field label="About a sport? (optional)">
          <select className="input" value={sportId} onChange={(e) => setSportId(e.target.value)}>
            <option value="">General</option>
            {sports.map((s) => (
              <option key={s.id} value={s.id}>
                {s.emoji} {s.name}
              </option>
            ))}
          </select>
        </Field>
        <MarkdownField label="Message" value={body} onChange={setBody} rows={10} />
        <ImageField label="Cover image (optional)" value={cover} onChange={setCover} folder="notices" />
        <div className="flex flex-wrap gap-x-6 gap-y-3">
          <label className="check">
            <input type="checkbox" checked={pinned} onChange={(e) => setPinned(e.target.checked)} />
            Pin to top
          </label>
          <label className="check">
            <input type="checkbox" checked={membersOnly} onChange={(e) => setMembersOnly(e.target.checked)} />
            Members only
          </label>
          <label className="check">
            <input type="checkbox" checked={published} onChange={(e) => setPublished(e.target.checked)} />
            Published
          </label>
        </div>
      </form>
    </Modal>
  )
}
