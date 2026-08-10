// Content library vocabulary — the facets Google Classroom forced into one
// flat topic list, separated: what a thing IS (kind), who may see it
// (audience), what discipline it belongs to (reused capability categories),
// and free-form topic tags for the skills vocabulary.

import { type CapabilityCategory } from '@/lib/capabilities'

export type LibraryAudience = 'internal' | 'shared'
export type LibrarySourceType = 'drive' | 'link' | 'youtube' | 'file'
export type LibraryStatus = 'pending' | 'published' | 'archived'
export type LibraryBucket = 'teaching' | 'resource' | 'map' | 'instructor'

// Four libraries rather than one pile. Only teaching material is carried by a
// course template — maps come from the venue, resources and instructor
// material are pulled in deliberately, and per-delivery logistics live on the
// course itself. Mixing them is how one course's travel plans reached another.
export const BUCKET_META: Record<LibraryBucket, { label: string; hint: string }> = {
  teaching:   { label: 'Teaching material', hint: 'How-tos: technique videos, walkthroughs, skill sheets' },
  resource:   { label: 'Resources',         hint: 'External reference: manuals, tech notes, standards' },
  map:        { label: 'Maps',              hint: 'CalTopo, SARTopo and other maps' },
  instructor: { label: 'Instructor material', hint: 'Guides, outlines and teaching notes — never shown to students' },
}
export const BUCKET_ORDER: LibraryBucket[] = ['teaching', 'resource', 'map', 'instructor']

// Two labels per level: `choice` where you pick it (be explicit — admins
// shouldn't have to guess who "shared" means), `badge` where space is tight.
export const AUDIENCE_META: Record<LibraryAudience, { badge: string; choice: string }> = {
  internal: { badge: 'Internal', choice: 'Instructors only' },
  shared: { badge: 'Students', choice: 'Students & instructors' },
}

// course_modules.audience is the older three-value enum; 'student' was never
// used and never actually hid anything from staff, so it folds into 'shared'.
export function moduleAudience(v: string): LibraryAudience {
  return v === 'instructor' ? 'internal' : 'shared'
}

export const LIBRARY_KINDS = [
  'manual',
  'tech_note',
  'presentation',
  'video',
  'map',
  'permit',
  'rescue_plan',
  'standard',
  'skill_sheet',
  'outline',
  'form',
  'media',
  'reference',
] as const
export type LibraryKind = (typeof LIBRARY_KINDS)[number]

export const KIND_META: Record<LibraryKind, string> = {
  manual: 'Manual',
  tech_note: 'Tech note / product doc',
  presentation: 'Presentation',
  video: 'Video',
  map: 'Map',
  permit: 'Permit',
  rescue_plan: 'Rescue plan',
  standard: 'Standard',
  skill_sheet: 'Skill sheet',
  outline: 'Course outline',
  form: 'Form / template',
  media: 'Photos / media',
  reference: 'Reference',
}

export type LibraryItem = {
  id: string
  title: string
  description: string | null
  source_type: LibrarySourceType
  url: string | null
  edit_url: string | null
  drive_file_id: string | null
  kind: string
  audience: LibraryAudience
  disciplines: string[]
  topics: string[]
  venue_id: string | null
  region: string | null
  expires_at: string | null
  status: LibraryStatus
  bucket: LibraryBucket
  source_class: string | null
  source_topic: string | null
  source_item: string | null
}

export type Venue = {
  id: string
  name: string
  region: string | null
  client_name: string | null
  notes: string | null
  active: boolean
}

// Emoji-prefixed Classroom topics ("📚Resource Materials") clean up to plain tags.
export function cleanTopic(raw: string): string {
  return raw
    .replace(/[\p{Extended_Pictographic}\u{1F3FB}-\u{1F3FF}\u{FE0F}\u{200D}\u{2000}-\u{2BFF}]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export function isDisciplineList(v: string[]): v is CapabilityCategory[] {
  return Array.isArray(v)
}
