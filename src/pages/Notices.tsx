import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useData } from '../context/DataContext'
import { fmtDate, relative } from '../lib/dates'
import { plainText } from '../lib/markdown'
import { isConfigured, supabase } from '../lib/supabase'
import type { Notice } from '../lib/types'
import NoticeForm from '../components/admin/NoticeForm'
import { EmptyState, Markdown, PageHeader, Spinner, SportTag } from '../components/ui'

export default function Notices() {
  const { access } = useAuth()
  const { sports, sportById } = useData()
  const [notices, setNotices] = useState<Notice[] | null>(null)
  const [sport, setSport] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)

  const load = () => {
    if (!isConfigured) return setNotices([])
    void supabase
      .from('notices')
      .select('*')
      .order('pinned', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(100)
      .then(({ data }) => setNotices((data as Notice[]) ?? []))
  }
  useEffect(load, [access.is_community, access.is_admin])

  const list = (notices ?? []).filter((n) => !sport || n.sport_id === sport)
  const usedSports = sports.filter((s) => notices?.some((n) => n.sport_id === s.id))

  return (
    <div>
      <PageHeader
        eyebrow="Announcements"
        title="Notices"
        actions={
          access.is_admin && (
            <button type="button" className="btn btn-primary btn-sm" onClick={() => setCreating(true)}>
              + Notice
            </button>
          )
        }
      >
        Tryout results, schedule changes, forms and reminders from the Student Council ADs.
      </PageHeader>

      {usedSports.length > 0 && (
        <div className="scroll-x -mx-4 mb-8 flex gap-1.5 px-4 sm:mx-0 sm:px-0">
          <button type="button" className="chip" aria-pressed={!sport} onClick={() => setSport(null)}>
            Everything
          </button>
          {usedSports.map((s) => (
            <button key={s.id} type="button" className="chip" aria-pressed={sport === s.id} onClick={() => setSport(s.id)}>
              {s.emoji} {s.name}
            </button>
          ))}
        </div>
      )}

      {notices === null ? (
        <Spinner />
      ) : list.length === 0 ? (
        <EmptyState icon="📣" title="No notices yet">
          When the ADs post something, it lands here.
        </EmptyState>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {list.map((n, i) => {
            const feature = i === 0 && !sport
            return (
              <Link
                key={n.id}
                to={`/notices/${n.id}`}
                className={`card group flex flex-col overflow-hidden transition hover:-translate-y-0.5 ${feature ? 'md:col-span-2 md:flex-row' : ''} ${!n.published ? 'opacity-60' : ''}`}
              >
                {n.cover_url && (
                  <img src={n.cover_url} alt="" className={`object-cover ${feature ? 'aspect-[16/9] md:aspect-auto md:w-1/2' : 'aspect-[16/7]'}`} />
                )}
                <div className={`flex flex-1 flex-col p-6 ${feature ? 'md:p-10' : ''}`}>
                  <div className="flex flex-wrap items-center gap-2">
                    {n.pinned && <span className="tag bg-signal text-white">Pinned</span>}
                    {!n.published && <span className="tag bg-surface-2">Draft</span>}
                    {n.members_only && <span className="tag bg-surface-2">Members</span>}
                    <SportTag sport={n.sport_id ? sportById.get(n.sport_id) : undefined} />
                  </div>
                  <h2 className={`mt-3 font-bold leading-tight group-hover:text-signal ${feature ? 'display text-4xl sm:text-5xl' : 'text-xl'}`}>{n.title}</h2>
                  <p className={`mt-2 muted ${feature ? 'line-clamp-3' : 'line-clamp-2 text-sm'}`}>{plainText(n.body, 280)}</p>
                  <p className="mt-auto pt-4 text-xs faint">
                    {fmtDate(n.created_at)} · {relative(n.created_at)}
                  </p>
                </div>
              </Link>
            )
          })}
        </div>
      )}

      {creating && <NoticeForm onClose={() => setCreating(false)} onSaved={load} />}
    </div>
  )
}

export function NoticeDetail() {
  const { id } = useParams()
  const { access } = useAuth()
  const { sportById } = useData()
  const navigate = useNavigate()
  const [notice, setNotice] = useState<Notice | null | undefined>(undefined)
  const [editing, setEditing] = useState(false)

  const load = () => {
    if (!isConfigured) return setNotice(null)
    void supabase
      .from('notices')
      .select('*')
      .eq('id', id ?? '')
      .maybeSingle()
      .then(({ data }) => setNotice((data as Notice) ?? null))
  }
  useEffect(load, [id, access.is_community])

  if (notice === undefined) return <Spinner />
  if (notice === null) {
    return (
      <EmptyState icon="🔒" title="Not available" action={<Link to="/notices" className="btn btn-ink">All notices</Link>}>
        This notice doesn’t exist, or it’s only for the GCS community — try signing in.
      </EmptyState>
    )
  }

  const sport = notice.sport_id ? sportById.get(notice.sport_id) : undefined
  return (
    <article className="rise mx-auto max-w-3xl">
      <Link to="/notices" className="text-sm font-semibold muted hover:text-ink">
        ← Notices
      </Link>
      <div className="mt-6 flex flex-wrap items-center gap-2">
        {notice.pinned && <span className="tag bg-signal text-white">Pinned</span>}
        <SportTag sport={sport} size="md" />
        <span className="text-sm faint">{fmtDate(notice.created_at)}</span>
        {access.is_admin && (
          <button type="button" className="btn btn-ghost btn-sm ml-auto" onClick={() => setEditing(true)}>
            Edit
          </button>
        )}
      </div>
      <h1 className="display mt-4 text-5xl sm:text-6xl">{notice.title}</h1>
      {notice.cover_url && <img src={notice.cover_url} alt="" className="mt-8 w-full rounded-3xl object-cover" />}
      <Markdown source={notice.body} className="mt-8" />
      {notice.updated_at !== notice.created_at && new Date(notice.updated_at).getTime() - new Date(notice.created_at).getTime() > 6e4 && (
        <p className="mt-10 text-xs faint">Updated {relative(notice.updated_at)}</p>
      )}
      {editing && (
        <NoticeForm
          notice={notice}
          onClose={() => setEditing(false)}
          onSaved={(deleted) => (deleted ? navigate('/notices') : load())}
        />
      )}
    </article>
  )
}
