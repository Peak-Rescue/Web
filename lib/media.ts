import { courseCapabilityCategories, CAPABILITY_META, type CapabilityCategory } from '@/lib/capabilities'
import { courseShortName } from '@/lib/courses'

// Photos and video that were captured, as opposed to the teaching videos that
// were chosen. A technique clip on the curriculum is library material someone
// picked; this is what came off a course, plus the general stuff shot for no
// delivery in particular.
//
// Browsed by album, because that is how anyone remembers it — "the Maui trip",
// not "a photo of an anchor". But every item also carries the tags of the
// course it came from, so "every canyon album" is one filter rather than
// opening fourteen albums to find out which ones were canyon courses.
//
// Those tags are derived here, never copied onto the row: the course already
// knows it was canyon work on Maui in March, and re-typing the course should
// re-tag its photos rather than leave them insisting on what it used to be.
// The same bargain a site's beta makes.

export type MediaAlbum = {
  /** The course's id, or null for the general album. */
  instanceId: string | null
  title: string
  /** Shown under the title: dates, place, client. */
  subtitle: string | null
  /** Drive folder, when there is one to open. */
  folderUrl: string | null
  count: number
  /** When the most recent thing in it was added. */
  latest: string | null
  /** Expertise, inherited from the course or set on the items themselves. */
  disciplines: string[]
  /** The offering, for the course albums that have one. */
  courseType: string | null
  /** Where it was, as the course said it. */
  location: string | null
  startsAt: string | null
}

export type AlbumCourse = {
  id: string
  course_type: string
  custom_title: string | null
  custom_categories: string[] | null
  location: string | null
  client_name: string | null
  starts_at: string | null
  ends_at: string | null
  ref_number: number | null
}

/** What a course lends its photos. Derived, so it is always what the course
    says now rather than what it said the day the shutter went. */
export function inheritedDisciplines(c: AlbumCourse): string[] {
  return courseCapabilityCategories(c.course_type, c.custom_categories) as string[]
}

export function disciplineLabels(ds: string[]): string[] {
  return ds.map((d) => CAPABILITY_META[d as CapabilityCategory]?.label ?? d)
}

const fmtDate = (d: string) =>
  new Date(`${d}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

/** The line under an album's name: when it ran and where. */
export function albumSubtitle(c: AlbumCourse): string {
  const when = c.starts_at
    ? c.ends_at && c.ends_at !== c.starts_at
      ? `${fmtDate(c.starts_at)} – ${fmtDate(c.ends_at)}`
      : fmtDate(c.starts_at)
    : 'dates TBD'
  return [when, c.location || c.client_name || null].filter(Boolean).join(' · ')
}

export function albumTitle(c: AlbumCourse): string {
  const name = courseShortName(c.course_type, c.custom_title)
  return c.ref_number ? `${name} · PR-${String(c.ref_number).padStart(4, '0')}` : name
}

/** Does this album answer the filter being asked? An album matches on what it
    inherited as readily as on what was typed on it — which is the whole point
    of inheriting: nobody tagged the Maui photos as canyon work, and they are. */
export function albumMatches(a: MediaAlbum, discipline?: string | null, q?: string | null): boolean {
  if (discipline && !a.disciplines.includes(discipline)) return false
  const needle = (q ?? '').trim().toLowerCase()
  if (!needle) return true
  return [a.title, a.subtitle, a.location].some((s) => (s ?? '').toLowerCase().includes(needle))
}
