import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { Modal, Notice, Spinner, useToast } from '../ui'

/**
 * "Add to Google Calendar": a personal subscription link. The calendar app
 * re-downloads it on its own schedule, so new and changed events show up
 * without anyone exporting anything — including your team-only events.
 */
export default function SubscribeDialog({ onClose }: { onClose: () => void }) {
  const toast = useToast()
  const [token, setToken] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function load(reset = false) {
    setBusy(true)
    setError(null)
    const { data, error: err } = await supabase.rpc('my_calendar_feed', { p_reset: reset })
    setBusy(false)
    if (err || !data) return setError(err?.message ?? 'Could not create your calendar link.')
    setToken(data as string)
    if (reset) toast('New link made — the old one stopped working')
  }

  useEffect(() => {
    void load()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const https = token ? `${window.location.origin}/ical/${token}.ics` : ''
  const webcal = https.replace(/^https?:/, 'webcal:')
  const google = `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcal)}`

  return (
    <Modal title="Add to your calendar" onClose={onClose}>
      <p className="text-sm muted">
        Subscribe once and every GCS Athletics event — plus your own team’s practices and meetings — shows up in the calendar app you already use, with
        reminders. New and changed events sync automatically.
      </p>

      {error && (
        <div className="mt-4">
          <Notice tone="error">{error}</Notice>
        </div>
      )}

      {!token ? (
        !error && <Spinner label="Making your link" />
      ) : (
        <>
          <div className="mt-6 grid gap-2 sm:grid-cols-2">
            <a href={google} target="_blank" rel="noreferrer" className="btn btn-primary py-3">
              <svg viewBox="0 0 24 24" className="size-5" aria-hidden>
                <rect x="3" y="4" width="18" height="17" rx="3" fill="#fff" />
                <path d="M3 8h18" stroke="#4285F4" strokeWidth="3" />
                <text x="12" y="18.5" textAnchor="middle" fontSize="9" fontWeight="700" fill="#4285F4" fontFamily="Arial">
                  31
                </text>
              </svg>
              Add to Google Calendar
            </a>
            <a href={webcal} className="btn btn-ghost py-3">
              Apple Calendar
            </a>
          </div>

          <div className="mt-6">
            <p className="label">Or copy the link (Outlook, others)</p>
            <div className="mt-1.5 flex gap-2">
              <input className="input font-mono text-xs" readOnly value={https} onFocus={(e) => e.currentTarget.select()} aria-label="Calendar link" />
              <button
                type="button"
                className="btn btn-ink shrink-0"
                onClick={() => {
                  void navigator.clipboard?.writeText(https)
                  toast('Link copied')
                }}
              >
                Copy
              </button>
            </div>
          </div>

          <ul className="mt-6 space-y-2 rounded-xl bg-surface-2/60 p-4 text-[13px] muted">
            <li>
              ⏱ Google Calendar checks for changes every few hours, so a just-added event can take a while to appear there. The website is always up to date.
            </li>
            <li>🔒 This link is personal — it includes your team’s private events. Don’t post it publicly.</li>
            <li>
              Shared it by accident?{' '}
              <button type="button" className="font-semibold text-signal underline underline-offset-2" disabled={busy} onClick={() => void load(true)}>
                Make a new link
              </button>{' '}
              and the old one stops working.
            </li>
          </ul>
        </>
      )}
    </Modal>
  )
}
