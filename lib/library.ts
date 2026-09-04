// Content library vocabulary — the facets Google Classroom forced into one
// flat topic list, separated: what a thing IS (kind), who may see it
// (audience), what discipline it belongs to (reused capability categories),
// and free-form topic tags for the skills vocabulary.

import { CAPABILITY_META, courseCapabilityCategories, type CapabilityCategory } from '@/lib/capabilities'

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

// The way back to a template from wherever it is being used. A template saved
// from a course used to be a one-way door in practice even after the library
// grew editors for them: nothing on the course page said where it had gone.
// The hash scrolls to the row, the query opens it.
export function templateHref(shelf: TemplateShelf, id: string, open: 'contents' | 'details' = 'details') {
  return `/admin/library?bucket=${shelf}&template=${id}&open=${open}#t-${id}`
}

export function templateShelfHref(shelf: TemplateShelf) {
  return `/admin/library?bucket=${shelf}`
}

/** What a course is, as far as picking a template goes: the offering it is,
    and the expertise it draws on. A custom course has no offering slug worth
    matching — every one of them is `custom` — but it does carry the boxes
    checked when it was set up, and those are the same vocabulary a template is
    tagged with. Which is why relevance is two tests, not one. */
// 'custom' is not an offering. Every bespoke course shares the slug, so a
// template tagged with it matches nothing that a template tagged with nothing
// wouldn't — it only wears a "Custom Course" pill it can't live up to, and
// sits outside the offering picker, which has no such option to pick back.
// A template saved off a custom course belongs to no offering at all.
export function templateOffering(courseType: string | null | undefined): string | null {
  return !courseType || courseType === 'custom' ? null : courseType
}

export type TemplateAudienceCourse = { course_type: string | null; categories: string[] }

/** Why this template is being offered for this course, or null if it isn't
    specific to it. The string is shown on the row, so a mixed custom course
    can see *which* half of it a template answers to. */
export function templateRelevance(
  t: { course_type?: string | null; disciplines?: string[] | null },
  course: TemplateAudienceCourse,
): string | null {
  // A typed course matches its own offering. 'custom' is deliberately not a
  // match with itself: every custom course shares that slug, so it would make
  // "for this offering" mean "someone once did something bespoke".
  if (t.course_type && t.course_type !== 'custom' && t.course_type === course.course_type) {
    return 'this offering'
  }
  // A template's own offering implies expertise too — a Class C Canyon Rescue
  // template is canyon work whether or not anyone ticked the Canyon box — so
  // the tag it was saved with counts alongside the ones typed on the shelf.
  // Without this, a template saved off a typed course reaches no custom course
  // at all until someone goes and tags it by hand.
  const implied = t.course_type ? courseCapabilityCategories(t.course_type, null) : []
  const tags = [...new Set([...(t.disciplines ?? []), ...implied])]
  const shared = tags.filter((d) => course.categories.includes(d))
  if (shared.length === 0) return null
  return shared
    .map((d) => CAPABILITY_META[d as CapabilityCategory]?.label ?? d)
    .join(', ')
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
