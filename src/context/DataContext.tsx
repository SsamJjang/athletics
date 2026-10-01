import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { isConfigured, supabase } from '../lib/supabase'
import type { Sport } from '../lib/types'
import { useAuth } from './AuthContext'

/**
 * Sports are tiny and referenced on every page (colors, names, filters),
 * so they're loaded once and shared. Follows ride along because the
 * calendar sidebar groups by them.
 */
interface DataValue {
  sports: Sport[]
  sportById: Map<string, Sport>
  sportsLoading: boolean
  reloadSports: () => Promise<void>
  follows: Set<string>
  toggleFollow: (sportId: string) => Promise<void>
  /** Sports whose roster I'm on (or, for a parent, my children are on). */
  myTeams: Set<string>
  reloadTeams: () => Promise<void>
}

const DataContext = createContext<DataValue | null>(null)

export function DataProvider({ children }: { children: ReactNode }) {
  const { session, access, profile } = useAuth()
  const [sports, setSports] = useState<Sport[]>([])
  const [sportsLoading, setSportsLoading] = useState(true)
  const [follows, setFollows] = useState<Set<string>>(new Set())
  const [myTeams, setMyTeams] = useState<Set<string>>(new Set())
  const userId = session?.user.id ?? null

  const reloadSports = useCallback(async () => {
    if (!isConfigured) {
      setSportsLoading(false)
      return
    }
    const { data } = await supabase.from('sports').select('*').order('sort_order').order('name')
    setSports((data as Sport[]) ?? [])
    setSportsLoading(false)
  }, [])

  // Everything requires a session, and admins also see inactive sports:
  // reload on sign-in, sign-out and access changes.
  useEffect(() => {
    void reloadSports()
  }, [reloadSports, userId, access.is_admin])

  const reloadTeams = useCallback(async () => {
    if (!userId || !profile) {
      setMyTeams(new Set())
      return
    }
    // RLS returns my rows and my children's; admins can read every roster,
    // so narrow to their own email.
    let q = supabase.from('team_members').select('sport_id')
    if (access.is_admin) q = q.eq('email', profile.email)
    const { data } = await q
    setMyTeams(new Set((data ?? []).map((r) => r.sport_id as string)))
  }, [userId, profile, access.is_admin])

  useEffect(() => {
    void reloadTeams()
  }, [reloadTeams])

  useEffect(() => {
    if (!userId) {
      setFollows(new Set())
      return
    }
    void supabase
      .from('follows')
      .select('sport_id')
      .eq('user_id', userId)
      .then(({ data }) => setFollows(new Set((data ?? []).map((r) => r.sport_id as string))))
  }, [userId])

  const toggleFollow = useCallback(
    async (sportId: string) => {
      if (!userId) return
      const on = follows.has(sportId)
      setFollows((prev) => {
        const next = new Set(prev)
        if (on) next.delete(sportId)
        else next.add(sportId)
        return next
      })
      const { error } = on
        ? await supabase.from('follows').delete().eq('user_id', userId).eq('sport_id', sportId)
        : await supabase.from('follows').insert({ user_id: userId, sport_id: sportId })
      if (error) {
        // Put it back the way it was.
        setFollows((prev) => {
          const next = new Set(prev)
          if (on) next.add(sportId)
          else next.delete(sportId)
          return next
        })
      }
    },
    [userId, follows],
  )

  const sportById = useMemo(() => new Map(sports.map((s) => [s.id, s])), [sports])

  const value = useMemo(
    () => ({ sports, sportById, sportsLoading, reloadSports, follows, toggleFollow, myTeams, reloadTeams }),
    [sports, sportById, sportsLoading, reloadSports, follows, toggleFollow, myTeams, reloadTeams],
  )
  return <DataContext.Provider value={value}>{children}</DataContext.Provider>
}

export function useData() {
  const ctx = useContext(DataContext)
  if (!ctx) throw new Error('useData must be used inside <DataProvider>')
  return ctx
}
