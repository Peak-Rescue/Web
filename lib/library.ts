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

// Two more shelves, browsed beside the four above but stored in their own
// tables: a gear list and a schedule are structured rows, not links, so
// they can't be library_items. What they share with the rest of the library is
// the vocabulary — a name, what it's for, disciplines, topics — and one place
// to find them.
export type TemplateShelf = 'gear' | 'schedule'
export type LibraryShelf = LibraryBucket | TemplateShelf

export const TEMPLATE_SHELF_META: Record<TemplateShelf, { label: string; hint: string; noun: string }> = {
  gear: {
    label: 'Gear lists',
    hint: 'Reusable kit lists — copied onto a course as its starting point',
    noun: 'gear list',
  },
  schedule: {
    label: 'Schedules',
    hint: 'Reusable running orders — days and topics, copied onto a course',
    noun: 'schedule',
  },
}

export const TEMPLATE_SHELF_ORDER: TemplateShelf[] = ['gear', 'schedule']
export const SHELF_ORDER: LibraryShelf[] = [...BUCKET_ORDER, ...TEMPLATE_SHELF_ORDER]

export function shelfLabel(v: LibraryShelf): string {
  return isTemplateShelf(v) ? TEMPLATE_SHELF_META[v].label : BUCKET_META[v].label
}

export function isTemplateShelf(v: string | undefined): v is TemplateShelf {
  return v === 'gear' || v === 'schedule'
}

// A template as the shelf lists it. `count` is items for a gear list, days for
// a schedule — the one number that tells you whether it's worth opening.
export type TemplateSummary = {
  id: string
  name: string
  description: string | null
  course_type: string | null
  disciplines: string[]
  topics: string[]
  count: number
  audience?: 'student' | 'instructor'
}

// Two labels per level: `choice` where you pick it (be explicit — admins
// shouldn't have to guess who "shared" means), `badge` where space is tight.
// Only the wording for pickers lives here now. Who-can-see-it is shown with
// <AudiencePills>, which names the groups rather than the policy — "Internal"
// and "Students" were two words for one axis and read as opposites when they
// weren't.
export const AUDIENCE_META: Record<LibraryAudience, { choice: string }> = {
  internal: { choice: 'Instructors only' },
  shared: { choice: 'Students & instructors' },
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

/** One way into a map: a URL, what you can do with it, and who may have it. */
export type MapLink = {
  id: string
  url: string
  access: 'read' | 'edit'
  audience: 'students' | 'instructors'
}

export const ACCESS_META: Record<MapLink['access'], string> = {
  read: 'Read-only',
  edit: 'Editable',
}

export const LINK_AUDIENCE_META: Record<MapLink['audience'], string> = {
  students: 'Students',
  instructors: 'Instructors',
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
  /** Maps only; every other kind has one link in `url`. */
  links?: MapLink[]
  source_class: string | null
  source_topic: string | null
  source_item: string | null
}

export type Venue = {
  id: string
  name: string
  region: string | null
  region_code: string | null
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
