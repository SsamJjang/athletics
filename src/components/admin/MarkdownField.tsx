import { useRef, useState } from 'react'
import { Markdown } from '../ui'
import { uploadImage } from '../../lib/upload'

/**
 * A plain textarea with a tiny toolbar and a preview tab. The ADs don't
 * need to know Markdown — the buttons write it for them.
 */
export default function MarkdownField({
  label,
  value,
  onChange,
  rows = 8,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  rows?: number
}) {
  const ref = useRef<HTMLTextAreaElement>(null)
  const file = useRef<HTMLInputElement>(null)
  const [preview, setPreview] = useState(false)
  const [uploading, setUploading] = useState(false)

  function wrap(before: string, after = before, placeholder = 'text') {
    const el = ref.current
    if (!el) return
    const { selectionStart: s, selectionEnd: e } = el
    const selected = value.slice(s, e) || placeholder
    const next = value.slice(0, s) + before + selected + after + value.slice(e)
    onChange(next)
    requestAnimationFrame(() => {
      el.focus()
      el.setSelectionRange(s + before.length, s + before.length + selected.length)
    })
  }

  function linePrefix(prefix: string) {
    const el = ref.current
    if (!el) return
    const s = el.selectionStart
    const lineStart = value.lastIndexOf('\n', s - 1) + 1
    onChange(value.slice(0, lineStart) + prefix + value.slice(lineStart))
    requestAnimationFrame(() => {
      el.focus()
      el.setSelectionRange(s + prefix.length, s + prefix.length)
    })
  }

  async function addImage(f: File) {
    setUploading(true)
    try {
      const url = await uploadImage(f)
      const el = ref.current
      const at = el ? el.selectionStart : value.length
      onChange(`${value.slice(0, at)}\n\n![](${url})\n\n${value.slice(at)}`)
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  const tools: [string, string, () => void][] = [
    ['B', 'Bold', () => wrap('**')],
    ['I', 'Italic', () => wrap('_')],
    ['H', 'Heading', () => linePrefix('### ')],
    ['•', 'Bullet list', () => linePrefix('- ')],
    ['1.', 'Numbered list', () => linePrefix('1. ')],
    ['🔗', 'Link', () => wrap('[', '](https://)', 'link text')],
  ]

  return (
    <div className="field">
      <div className="flex items-center justify-between">
        <span className="label">{label}</span>
        <div className="segmented scale-90 origin-right">
          <button type="button" aria-pressed={!preview} onClick={() => setPreview(false)}>
            Write
          </button>
          <button type="button" aria-pressed={preview} onClick={() => setPreview(true)}>
            Preview
          </button>
        </div>
      </div>
      {preview ? (
        <div className="min-h-32 rounded-xl border hairline p-4">
          {value.trim() ? <Markdown source={value} /> : <p className="text-sm faint">Nothing to preview.</p>}
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-[var(--line-strong)] focus-within:border-signal">
          <div className="flex flex-wrap items-center gap-0.5 border-b hairline bg-surface-2/50 px-1.5 py-1">
            {tools.map(([glyph, name, fn]) => (
              <button key={name} type="button" title={name} aria-label={name} onClick={fn} className="grid h-8 min-w-8 place-items-center rounded-md px-1.5 text-sm font-bold muted hover:bg-surface hover:text-ink">
                {glyph}
              </button>
            ))}
            <button type="button" onClick={() => file.current?.click()} disabled={uploading} className="ml-auto rounded-md px-2 py-1 text-xs font-semibold muted hover:bg-surface hover:text-ink">
              {uploading ? 'Uploading…' : '+ Image'}
            </button>
            <input
              ref={file}
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) void addImage(f)
                e.target.value = ''
              }}
            />
          </div>
          <textarea
            ref={ref}
            className="block w-full resize-y bg-surface px-3.5 py-3 text-[15px] leading-relaxed outline-none"
            rows={rows}
            value={value}
            onChange={(e) => onChange(e.target.value)}
          />
        </div>
      )}
    </div>
  )
}
