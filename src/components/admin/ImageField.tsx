import { useRef, useState } from 'react'
import { uploadImage } from '../../lib/upload'

export default function ImageField({
  label,
  value,
  onChange,
  folder,
  aspect = 'aspect-[16/7]',
}: {
  label: string
  value: string | null
  onChange: (url: string | null) => void
  folder: string
  aspect?: string
}) {
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [over, setOver] = useState(false)

  async function take(file: File | undefined) {
    if (!file) return
    setBusy(true)
    setError(null)
    try {
      onChange(await uploadImage(file, folder))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="field">
      <span className="label">{label}</span>
      <div
        className={`relative ${aspect} overflow-hidden rounded-xl border-2 border-dashed transition ${over ? 'border-signal bg-[var(--signal-soft)]' : 'border-[var(--line-strong)]'}`}
        onDragOver={(e) => {
          e.preventDefault()
          setOver(true)
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault()
          setOver(false)
          void take(e.dataTransfer.files[0])
        }}
      >
        {value ? (
          <>
            <img src={value} alt="" className="absolute inset-0 size-full object-cover" />
            <div className="absolute bottom-2 right-2 flex gap-1.5">
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => input.current?.click()}>
                Replace
              </button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => onChange(null)}>
                Remove
              </button>
            </div>
          </>
        ) : (
          <button type="button" onClick={() => input.current?.click()} className="absolute inset-0 grid place-items-center text-sm font-semibold muted hover:text-ink">
            {busy ? 'Uploading…' : 'Drop an image or click to choose'}
          </button>
        )}
      </div>
      {error && <span className="text-xs text-signal">{error}</span>}
      <input
        ref={input}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          void take(e.target.files?.[0])
          e.target.value = ''
        }}
      />
    </div>
  )
}
