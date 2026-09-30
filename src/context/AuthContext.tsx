import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { SCHOOL_DOMAIN, isConfigured, redirectUrl, supabase } from '../lib/supabase'
import type { Access, Profile } from '../lib/types'
import { NO_ACCESS } from '../lib/types'

type Door = 'student' | 'parent'

interface AuthValue {
  session: Session | null
  profile: Profile | null
  access: Access
  loading: boolean
  authError: string | null
  clearAuthError: () => void
  signInWithGoogle: (door: Door) => Promise<void>
  sendEmailCode: (email: string) => Promise<string | null>
  verifyEmailCode: (email: string, code: string) => Promise<string | null>
  signOut: () => Promise<void>
  refresh: () => Promise<void>
}

const AuthContext = createContext<AuthValue | null>(null)
const DOOR_KEY = 'gcs-door'

function readCallbackError(): string | null {
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''))
  const query = new URLSearchParams(window.location.search)
  const raw = hash.get('error_description') ?? query.get('error_description') ?? hash.get('error') ?? query.get('error')
  if (!raw) return null
  const text = decodeURIComponent(raw.replace(/\+/g, ' '))
  if (/access_denied/i.test(text)) return 'Sign-in was cancelled.'
  if (/email_required/i.test(text)) return 'That account has no email address. Try a different one.'
  return text
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [access, setAccess] = useState<Access>(NO_ACCESS)
  const [loading, setLoading] = useState(true)
  const [authError, setAuthError] = useState<string | null>(null)
  const alive = useRef(true)

  useEffect(() => {
    alive.current = true
    const err = readCallbackError()
    if (err) {
      setAuthError(err)
      window.history.replaceState({}, '', '/login')
    }
    return () => {
      alive.current = false
    }
  }, [])

  const load = useCallback(async (userId: string | null) => {
    if (!userId) {
      setProfile(null)
      setAccess(NO_ACCESS)
      return
    }
    const [p, a] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', userId).maybeSingle(),
      supabase.rpc('my_access'),
    ])
    if (!alive.current) return
    const prof = (p.data as Profile | null) ?? null
    const acc = (a.data as Access | null) ?? NO_ACCESS

    // Someone used the Student button with a personal Google account. The
    // database made them an (unverified) parent account, which is harmless,
    // but it's not what they wanted — say so and send them back.
    const door = sessionStorage.getItem(DOOR_KEY)
    sessionStorage.removeItem(DOOR_KEY)
    if (door === 'student' && prof?.kind === 'parent' && !acc.is_admin) {
      await supabase.auth.signOut()
      if (!alive.current) return
      setAuthError(
        `Students sign in with their @${SCHOOL_DOMAIN} Google account. ${prof.email} is a personal address — parents, use the Parent tab.`,
      )
      setProfile(null)
      setAccess(NO_ACCESS)
      return
    }

    setProfile(prof)
    setAccess(acc)
  }, [])

  useEffect(() => {
    if (!isConfigured) {
      setLoading(false)
      return
    }
    supabase.auth.getSession().then(async ({ data }) => {
      if (!alive.current) return
      setSession(data.session)
      await load(data.session?.user.id ?? null)
      if (alive.current) setLoading(false)
    })

    const { data: sub } = supabase.auth.onAuthStateChange((event, next) => {
      if (!alive.current) return
      setSession(next)
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'USER_UPDATED') {
        // Deferred: calling supabase-js inside this callback can deadlock its lock.
        setTimeout(() => void load(next?.user.id ?? null), 0)
      }
    })
    return () => sub.subscription.unsubscribe()
  }, [load])

  const signInWithGoogle = useCallback(async (door: Door) => {
    setAuthError(null)
    sessionStorage.setItem(DOOR_KEY, door)
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: redirectUrl(door === 'parent' ? '/family' : '/'),
        // `hd` only pre-filters Google's account picker. The real check is
        // the domain test in the database.
        queryParams:
          door === 'student' ? { prompt: 'select_account', hd: SCHOOL_DOMAIN } : { prompt: 'select_account' },
      },
    })
    if (error) setAuthError(error.message)
  }, [])

  const sendEmailCode = useCallback(async (email: string) => {
    setAuthError(null)
    sessionStorage.setItem(DOOR_KEY, 'parent')
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { shouldCreateUser: true, emailRedirectTo: redirectUrl('/family') },
    })
    return error ? error.message : null
  }, [])

  const verifyEmailCode = useCallback(async (email: string, code: string) => {
    const { error } = await supabase.auth.verifyOtp({ email: email.trim(), token: code.trim(), type: 'email' })
    return error ? error.message : null
  }, [])

  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
    setSession(null)
    setProfile(null)
    setAccess(NO_ACCESS)
  }, [])

  const refresh = useCallback(async () => {
    await load(session?.user.id ?? null)
  }, [load, session])

  const value = useMemo<AuthValue>(
    () => ({
      session,
      profile,
      access,
      loading,
      authError,
      clearAuthError: () => setAuthError(null),
      signInWithGoogle,
      sendEmailCode,
      verifyEmailCode,
      signOut,
      refresh,
    }),
    [session, profile, access, loading, authError, signInWithGoogle, sendEmailCode, verifyEmailCode, signOut, refresh],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}
