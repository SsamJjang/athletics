import type { EventKind, Season } from './types'

export const SEASONS: { id: Season; label: string; months: string; color: string }[] = [
  { id: 'fall', label: 'Fall', months: 'Aug – Nov', color: 'var(--fall)' },
  { id: 'winter', label: 'Winter', months: 'Nov – Feb', color: 'var(--winter)' },
  { id: 'spring', label: 'Spring', months: 'Mar – May', color: 'var(--spring)' },
  { id: 'year', label: 'Year-round', months: 'Any time', color: 'var(--year)' },
]

export function seasonOf(id: Season) {
  return SEASONS.find((s) => s.id === id) ?? SEASONS[0]
}

/**
 * Which season is "now", by month. Rough on purpose — the overlap weeks
 * go to whichever season is starting, since that's what students are
 * signing up for.
 */
export function currentSeason(date = new Date()): Season {
  const m = date.getMonth() // 0 = Jan
  if (m >= 7 && m <= 9) return 'fall' // Aug–Oct
  if (m >= 10 || m <= 1) return 'winter' // Nov–Feb
  if (m >= 2 && m <= 5) return 'spring' // Mar–Jun
  return 'fall' // July: next up is fall
}

export const EVENT_KINDS: { id: EventKind; label: string; color: string; icon: string }[] = [
  { id: 'game', label: 'Game', color: '#b4232b', icon: '●' },
  { id: 'tournament', label: 'Tournament', color: '#c08a2a', icon: '◆' },
  { id: 'tryout', label: 'Tryout', color: '#7c5ce0', icon: '▲' },
  { id: 'deadline', label: 'Deadline', color: '#e0336f', icon: '⏱' },
  { id: 'practice', label: 'Practice', color: '#6b7280', icon: '■' },
  { id: 'meeting', label: 'Meeting', color: '#0f9488', icon: '◇' },
  { id: 'other', label: 'Other', color: '#64748b', icon: '○' },
]

export function kindOf(id: EventKind) {
  return EVENT_KINDS.find((k) => k.id === id) ?? EVENT_KINDS[EVENT_KINDS.length - 1]
}

export const SPORT_COLORS = [
  '#E4462B', '#EA580C', '#F59E0B', '#A16207', '#16A34A', '#0D9488',
  '#0EA5E9', '#2563EB', '#4F46E5', '#8B5CF6', '#DB2777', '#475569',
]

/**
 * Text color that stays readable on an event's fill: dark ink on light
 * colors (yellow, sky blue), white on everything else.
 */
export function textOn(color: string) {
  const m = /^#?([0-9a-f]{6})$/i.exec(color.trim())
  if (!m) return '#fff'
  const n = parseInt(m[1], 16)
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b
  return lum > 0.36 ? '#1b1314' : '#fff'
}
