import { useCallback, useEffect, useState } from 'react'
import { isConfigured, supabase } from './supabase'
import type { GEvent } from './types'

/**
 * Events overlapping [from, to). An event that started before `from` but
 * runs into the window (a 3-day tournament) is included.
 */
export async function fetchEvents(from: Date, to: Date) {
  if (!isConfigured) return [] as GEvent[]
  const { data, error } = await supabase
    .from('events')
    .select('*')
    .lt('starts_at', to.toISOString())
    .or(`ends_at.gte.${from.toISOString()},and(ends_at.is.null,starts_at.gte.${from.toISOString()})`)
    .order('starts_at')
  if (error) throw error
  return (data as GEvent[]) ?? []
}

export async function fetchTotals(ids: string[]) {
  const totals = new Map<string, number>()
  if (!ids.length || !isConfigured) return totals
  const { data } = await supabase.from('event_signup_totals').select('event_id,total').in('event_id', ids)
  for (const row of data ?? []) totals.set(row.event_id as string, row.total as number)
  return totals
}

export function useEventsRange(from: Date, to: Date) {
  const [events, setEvents] = useState<GEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const fromIso = from.toISOString()
  const toIso = to.toISOString()

  const reload = useCallback(async () => {
    setLoading(true)
    try {
      setEvents(await fetchEvents(new Date(fromIso), new Date(toIso)))
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load events')
    } finally {
      setLoading(false)
    }
  }, [fromIso, toIso])

  useEffect(() => {
    void reload()
  }, [reload])

  return { events, loading, error, reload }
}

/** Sign-ups are open right now for this event (the database re-checks). */
export function signupOpen(e: GEvent, total = 0, now = new Date()) {
  if (!e.signup_enabled || e.cancelled) return false
  const closes = new Date(e.signup_deadline ?? e.starts_at)
  if (now >= closes) return false
  return e.capacity == null || total < e.capacity
}

export function signupCloses(e: GEvent) {
  return new Date(e.signup_deadline ?? e.starts_at)
}
