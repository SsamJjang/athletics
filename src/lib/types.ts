export type Season = 'fall' | 'winter' | 'spring' | 'year'
export type Tier = 'team' | 'opportunity'
export type EventKind = 'game' | 'tournament' | 'tryout' | 'deadline' | 'practice' | 'meeting' | 'other'
export type HomeAway = 'home' | 'away' | 'neutral'
export type Outcome = 'win' | 'loss' | 'draw'

export interface Profile {
  id: string
  email: string
  full_name: string
  avatar_url: string | null
  kind: 'school' | 'parent'
  grade: number | null
  admin_verified: boolean
  created_at: string
}

export interface Access {
  is_admin: boolean
  is_school: boolean
  is_verified_parent: boolean
  is_community: boolean
}

export const NO_ACCESS: Access = {
  is_admin: false,
  is_school: false,
  is_verified_parent: false,
  is_community: false,
}

export interface Sport {
  id: string
  slug: string
  name: string
  season: Season
  tier: Tier
  divisions: string | null
  emoji: string | null
  color: string
  summary: string | null
  body: string
  coach: string | null
  practice_info: string | null
  how_to_join: string | null
  cover_url: string | null
  sort_order: number
  active: boolean
}

export interface GEvent {
  id: string
  series_id: string | null
  title: string
  kind: EventKind
  sport_id: string | null
  starts_at: string
  ends_at: string | null
  all_day: boolean
  location: string | null
  opponent: string | null
  home_away: HomeAway | null
  description: string
  signup_enabled: boolean
  signup_deadline: string | null
  capacity: number | null
  result: string | null
  outcome: Outcome | null
  members_only: boolean
  cancelled: boolean
  created_at: string
}

export interface Notice {
  id: string
  title: string
  body: string
  sport_id: string | null
  cover_url: string | null
  pinned: boolean
  members_only: boolean
  published: boolean
  created_at: string
  updated_at: string
}

export interface QA {
  q: string
  a: string
}

export interface Athlete {
  id: string
  full_name: string
  grade: number | null
  headline: string | null
  sport_ids: string[]
  photo_url: string | null
  quote: string | null
  bio: string
  qa: QA[]
  jersey: string | null
  featured: boolean
  published: boolean
  sort_order: number
}

export interface ParentInvite {
  code: string
  student_id: string
  created_at: string
  expires_at: string
  used_by: string | null
  used_at: string | null
}

export interface ParentLink {
  parent_id: string
  student_id: string
  relationship: string
  created_at: string
}

export interface Signup {
  event_id: string
  user_id: string
  note: string | null
  created_at: string
}
