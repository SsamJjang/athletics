import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const isConfigured = Boolean(url && anonKey)

if (!isConfigured) {
  console.warn(
    'Supabase is not configured. Copy .env.example to .env and fill in ' +
      'VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.',
  )
}

export const supabase = createClient(url ?? 'http://localhost', anonKey ?? 'anon', {
  auth: {
    flowType: 'pkce',
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
})

/** Must match the domain enforced in supabase/schema.sql (school_domain()). */
export const SCHOOL_DOMAIN = 'gcssongdo.co.kr'

/** Where OAuth and emailed links return to. Cloudflare Pages serves at the root. */
export function redirectUrl(path = '/') {
  return window.location.origin + path
}
