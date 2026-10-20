// Content library vocabulary — the facets Google Classroom forced into one
// flat topic list, separated: what a thing IS (kind), who may see it
// (audience), what discipline it belongs to (reused capability categories),
// and free-form topic tags for the skills vocabulary.

import { CAPABILITY_META, courseCapabilityCategories, type CapabilityCategory } from '@/lib/capabilities'

export type LibraryAudience = 'internal' | 'shared'
export type LibrarySourceType = 'drive' | 'link' | 'youtube' | 'file'
export type LibraryStatus = 'pending' | 'published' | 'archived'
export type LibraryBucket = 'teaching' | 'resource' | 'map' | 'instructor' | 'documents'

// Four libraries rather than one pile. Only teaching material is carried by a
// course template — maps come from the venue, resources and instructor
// material are pulled in deliberately, and per-delivery logistics live on the
// course itself. Mixing them is how one course's travel plans reached another.
export const BUCKET_META: Record<LibraryBucket, { label: string; hint: string }> = {
  teaching:   { label: 'Teaching material', hint: 'How-tos: technique videos, walkthroughs, skill sheets' },
  resource:   { label: 'Reference',         hint: 'Manuals, tech notes, standards, papers' },
  map:        { label: 'Maps',              hint: 'CalTopo, SARTopo and other maps' },
  instructor: { label: 'Instructor material', hint: 'Guides, outlines and teaching notes — never shown to students' },
  // The company rather than the course. Everything here was living in
  // whichever teaching shelf it least embarrassed — eighteen logo files under
  // instructor material, the employee handbook beside rope technique — on the
  // grounds that it had to go somewhere. Nobody looks a logo up.
  //
  // A place's evac plan is no longer among them. It is read under its venue
  // with the maps and the beta; what is left here is the blank one it gets
  // written on.
  documents:  { label: 'Documents',          hint: 'JPRs, equipment logs, blank forms and Peak paperwork' },
}
export const BUCKET_ORDER: LibraryBucket[] = ['teaching', 'resource', 'map', 'instructor', 'documents']

// Two more shelves, browsed beside the four above but stored in their own
// tables: a gear list and a schedule are structured rows, not links, so
// they can't be library_items. What they share with the rest of the library is
// the vocabulary — a name, what it's for, disciplines, topics — and one place
// to find them.
export type TemplateShelf = 'gear' | 'schedule' | 'setup'

// And one more that is neither a document nor a template: the places
// themselves. A canyon's beta is material someone comes here looking for — it
// just isn't a link, so it could never be a library_item — and while it lived
// on a screen of its own, the only way to find it was to already know that
// screen existed.
//
// Venues are deliberately not a shelf beside it. A venue groups sites and
// files a course, which is work done underneath something else: nobody goes
// looking for a region, they go looking for the canyon in it. So it is a
// heading on this shelf and a door at the bottom of it.
export type PlaceShelf = 'venue'

// And the captured stuff: what came off a course, plus what was shot for no
// course in particular. Not the teaching videos — those were chosen, and a
// chosen clip is curriculum. This is the shoebox.
export type MediaShelfKey = 'media'
export type LibraryShelf = LibraryBucket | TemplateShelf | PlaceShelf | MediaShelfKey

export const PLACE_SHELF_META: Record<PlaceShelf, { label: string; hint: string }> = {
  venue: {
    label: 'Venue information',
    hint: 'Maps, beta, weather and contacts — everything filed by where it is',
  },
}

// `site` was this shelf's first name, back when it held only the canyons. Maps
// moved in with them, which is the shape they were always read in — you do not
// go looking for a map, you go looking for where you are going — so the shelf
// is the place now and the old name still opens it.
export function isMediaShelf(v: string | undefined): v is MediaShelfKey {
  return v === 'media'
}

/** The shelf a type belongs on, from the group it is listed under. Choosing
    "Permit" has already said Documents; asking again on the next line is the
    same question twice, and the two answers could disagree. Null for the
    untyped catch-all and for the types whose card is not a shelf — a map and a
    photo album are read from the venue and the media card, and their bucket is
    bookkeeping. */
// Said outright rather than read off the group a type is listed under. The
// two came apart when plans and permits moved to the Venue information card:
// that is where they are read, and Documents is still the shelf they sit on.
const BUCKET_FOR_KIND: Partial<Record<LibraryKind, LibraryBucket>> = {
  map: 'map',
  // A write-up about a place is a document about a place. It was 'map'
  // because route used to be a map, and that put it on a shelf whose whole
  // contents are maps.
  route: 'documents',
  permit: 'documents',
  medevac: 'documents',
  form: 'documents',
  manual: 'resource',
  tech_note: 'resource',
  standard: 'resource',
  presentation: 'teaching',
  skill_sheet: 'teaching',
  kit_list: 'teaching',
  outline: 'instructor',
}

export function bucketForKind(kind: string): LibraryBucket | null {
  return BUCKET_FOR_KIND[kind as LibraryKind] ?? null
}

export function isPlaceShelf(v: string | undefined): v is PlaceShelf {
  return v === 'venue' || v === 'site'
}

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
  setup: {
    label: 'Course setups',
    hint: 'The sections and material a kind of course normally starts with',
    noun: 'course setup',
  },
}

export const TEMPLATE_SHELF_ORDER: TemplateShelf[] = ['gear', 'schedule', 'setup']
// No card for maps of their own. A map is about a place, and the place is what
// anybody is actually looking for — so the maps are inside Venue information
// with the beta and the weather, rather than beside it as a second answer to
// the same question. The map shelf still exists as a filter and a bucket;
// it just isn't a door.
export const SHELF_ORDER: LibraryShelf[] = ['teaching', 'resource', 'venue', 'instructor', 'documents', 'media', ...TEMPLATE_SHELF_ORDER]

export function shelfLabel(v: LibraryShelf): string {
  if (isMediaShelf(v)) return 'Photos & video'
  if (isPlaceShelf(v)) return PLACE_SHELF_META[v].label
  return isTemplateShelf(v) ? TEMPLATE_SHELF_META[v].label : BUCKET_META[v].label
}

export function shelfHint(v: LibraryShelf): string {
  if (isMediaShelf(v)) return 'What we shot — by the course it came from, and searchable across all of them'
  if (isPlaceShelf(v)) return PLACE_SHELF_META[v].hint
  return isTemplateShelf(v) ? TEMPLATE_SHELF_META[v].hint : BUCKET_META[v].hint
}

export function isTemplateShelf(v: string | undefined): v is TemplateShelf {
  return v === 'gear' || v === 'schedule' || v === 'setup'
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

/** The address of a shelf, and what to call it on the way there.
 *
 * Both were typed by hand wherever a screen linked out to the library, so a
 * shelf that changed name or stopped being a card left behind a handful of
 * buttons still promising the old one — "Map library", "Resource library",
 * "Sites" — each pointing at an address that happened to still resolve, so
 * nothing broke loudly enough to be found. They come from here now, and the
 * name comes from the same table the card is drawn from. */
export function shelfLink(shelf: LibraryShelf, params?: Record<string, string>) {
  const q = new URLSearchParams({ bucket: shelf, ...params })
  return { href: `/admin/library?${q.toString()}`, label: shelfLabel(shelf) }
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
  'route',
  'permit',
  'medevac',
  'standard',
  'skill_sheet',
  'kit_list',
  'outline',
  'form',
  'media',
  'reference',
] as const
export type LibraryKind = (typeof LIBRARY_KINDS)[number]

// The type list, grouped the way the cards are.
//
// Fourteen types in one flat dropdown asked people to remember which card each
// one ends up on, when the answer is already drawn on the landing page. Picked
// this way the question reads as it is meant to: Venue information, then Route
// / beta under it.
//
// This is which card a type belongs to, not which shelf the row sits on —
// `bucket` still says that, and the sorting pass still proposes it. A manual
// is reference material wherever someone filed it.
export const KIND_GROUPS: { label: string; kinds: LibraryKind[] }[] = [
  { label: 'Teaching material', kinds: ['presentation', 'skill_sheet', 'video'] },
  // A kit list reads on the Gear lists shelf beside the structured ones, the
  // way a MEDEVAC plan reads on the venue. Which shelf the row sits on is a
  // separate question, answered below.
  { label: 'Gear lists',        kinds: ['kit_list'] },
  { label: 'Reference',         kinds: ['manual', 'tech_note', 'standard'] },
  { label: 'Instructor material', kinds: ['outline'] },
  { label: 'Documents',         kinds: ['form'] },
  // A plan and a permit are about one place — Deer Haven's risk eval, the
  // Snoqualmie permit — so they are listed under the card they are read on.
  // Which shelf the row sits on is a different question, answered below.
  { label: 'Venue information', kinds: ['map', 'route', 'medevac', 'permit'] },
  { label: 'Photos & video',    kinds: ['media'] },
  // `reference` is deliberately not here. It is the absence of an answer,
  // and listing it under a heading called "Not said yet" put the word
  // Reference in this list twice — once as the shelf three types belong to,
  // once as the type meaning nobody has said. It is rendered on its own, at
  // the top, where an unanswered question belongs.
]

export const KIND_META: Record<LibraryKind, string> = {
  manual: 'Manual',
  tech_note: 'Tech note / product doc',
  presentation: 'Presentation',
  video: 'Video',
  map: 'Map',
  // A ropewiki page is not a map. It is somebody's write-up of the descent —
  // raps, approach, exit — which is beta, and forcing it onto the map shelf
  // made it claim a place it did not have: the ropewiki region index was
  // filed to Taiwan because being a map demanded a venue.
  route: 'Route / beta',
  permit: 'Permit',
  // Where the hospital is, how long the drive is, how somebody gets to it.
  // One type, because it is one question — and usually one document: the
  // Maui one is called Medical-MEDEVAC-Plan. It was two, med plan and
  // rescue plan, which only ever meant somebody had to decide which half of
  // the answer they were holding.
  medevac: 'MEDEVAC plan',
  standard: 'Standard',
  skill_sheet: 'Skill sheet',
  // What a student is told to bring, as a document. It reads on the Gear
  // lists shelf with the structured ones — the same answer in the shape it
  // was written in, years before there was a structure to hold it — and the
  // two are told apart on the row rather than by living on different
  // shelves.
  kit_list: 'Kit list',
  outline: 'Course outline',
  form: 'Form / template',
  media: 'Photos / media',
  // Not a type: the absence of one. Named for what it is, so the list does
  // not offer Reference as both a shelf heading and a thing to be.
  reference: 'Not said yet',
}

/**
 * What a piece of material *is*, for the icon in front of it: something you
 * watch, something you read, or a page you open.
 *
 * Worked out from the link rather than from a stored type. `course_items.type`
 * was the field for this and is null on every row there has ever been, so the
 * video and document icons have never once rendered — everything has drawn the
 * link icon since the day they were written.
 *
 * The kind on a library item isn't enough on its own either: a good half of
 * what's filed as `reference` is a YouTube short, and another chunk is a Drive
 * PDF. The link is the one thing that can't be wrong about itself.
 */
export function materialKind(item: {
  url?: string | null
  drive_file_id?: string | null
  kind?: string | null
}): 'video' | 'doc' | 'link' {
  const url = item.url ?? ''
  if (/youtube\.com|youtu\.be|vimeo\.com/i.test(url)) return 'video'
  if (item.drive_file_id || /\.pdf($|\?)/i.test(url) || /drive\.google\.com|docs\.google\.com/i.test(url)) return 'doc'
  // Nothing in the link says what it is, so fall back to what it was filed as.
  if (item.kind === 'video') return 'video'
  return 'link'
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
  /** Only the five admins may see it, and it is never offered to a course.
      Sits on top of `audience` rather than replacing it: an admin-only item
      is also `internal`, so every check that already hides internal material
      from students goes on working, and a read path that forgets this gate
      fails back to instructors-only rather than to the world. */
  admin_only: boolean
  venue_id: string | null
  /** The specific canyon this is about, when it is about one. `venue_id` is
      still set, derived from the site, so the matching that reads the venue
      never has to know whether the filing was precise. */
  site_id: string | null
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

/** `weather` is its own block on the venue — the gauge and the forecast are
    what someone is looking for at 0500 and read differently from a permit
    portal. Anything unlabelled is just a link. */
export type VenueLinkKind = 'weather' | 'access' | 'other'
export type VenueLink = { url: string; label: string; kind?: VenueLinkKind }

/** Not a link: a name and a number, sometimes an email, sometimes a sentence
    about when to ring. The ranger district, the landowner, the gate code. */
export type VenueContact = {
  name: string
  role?: string
  phone?: string
  email?: string
  note?: string
}

export type Venue = {
  id: string
  name: string
  region: string | null
  region_code: string | null
  /** Who the venue belongs to, where it is somebody's site — CocoCay is Royal
      Caribbean's, and so is Labadee. Nothing writes this any more: a client is
      somebody we work for rather than a fact about a place, and it is becoming
      a row of its own. Kept so the six names that are in it survive to be read
      by whatever takes them. */
  client_name: string | null
  notes: string | null
  /** Standing links for the region: weather, permit portal, hospital, the
      drive in. Same shape as a site's, and the division is the one the site
      table already draws — the canyon's own route page and gauge belong to
      the site, what is true of the whole region belongs here. */
  links: VenueLink[]
  contacts: VenueContact[]
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


// ─── Where a thing probably belongs ─────────────────────────────────────────
//
// 822 items arrived from Classroom filed by which class they were posted in,
// which says nothing about what they are: logos and rope technique sit on the
// same shelf because they were posted to the same room.
//
// This is a first guess, never a move. What it is beats where it came from —
// a permit is paperwork wherever it was posted — and the Classroom topic is
// only consulted when the kind is the catch-all, which is 49 of them.
//
// Returns null when there is no confident guess, which is the honest answer
// more often than it is comfortable: a wrong guess accepted in bulk is worse
// than no guess, because nobody re-checks a shelf that looks sorted.

const PAPERWORK = /\b(logo|letterhead|handbook|incident|welcome letter|expectation|jpr|evac|risk assessment|equipment log|roster|waiver|sign.?up|employee|invoice|w-?9|coi\b)/i

export function proposedBucket(item: {
  kind: string
  bucket: LibraryBucket | null
  title: string
  source_topic?: string | null
}): LibraryBucket | null {
  // Paperwork by type, whatever room it was posted in.
  if (item.kind === 'permit' || item.kind === 'form' || item.kind === 'medevac') return 'documents'
  // A map's shelf is its type; nothing here should ever move one.
  if (item.kind === 'map') return 'map'
  if (item.kind === 'standard' || item.kind === 'tech_note' || item.kind === 'manual') return 'resource'
  if (item.kind === 'presentation' || item.kind === 'skill_sheet') return 'teaching'
  if (item.kind === 'outline') return 'instructor'
  // Photos and video are their own question, answered on the media shelf
  // rather than by shuffling them between the teaching ones.
  if (item.kind === 'video' || item.kind === 'media') return null

  // Catch-all kinds: fall back to what the thing is called, then to the
  // Classroom topic it was posted under.
  const topic = (item.source_topic ?? '').replace(/\(DO NOT POST\)/i, '').trim()
  // Pre-course information and the pre-course survey are things a student is
  // given, so they are teaching material — even though the room they were
  // posted in was the scheduling one and the word "survey" reads like
  // paperwork. Checked before the paperwork rules for exactly that reason.
  if (/pre.?course/i.test(item.title)) return 'teaching'
  if (PAPERWORK.test(item.title) || PAPERWORK.test(topic)) return 'documents'
  if (/peak documents|employee information|scheduling/i.test(topic)) return 'documents'
  if (/standards|product manual|tech note/i.test(topic)) return 'resource'
  if (/class notes|instructor/i.test(topic)) return 'instructor'
  return null
}
