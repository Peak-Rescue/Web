// A site is a place a course actually happens at — a canyon, a crag, a tower —
// as opposed to a venue, which is the region a course is sold against.
//
// Its beta is the half that doesn't change between courses: approach, rap
// count, exit, hazards. A schedule day points at one and shows it live, so
// correcting a rap count corrects it everywhere. What is only true of one day
// stays in that day's notes.

export type SiteLink = { url: string; label: string }

export type Site = {
  id: string
  venue_id: string | null
  name: string
  kind: string | null
  beta: string | null
  coords: string | null
  links: SiteLink[]
  active: boolean
}

// Offered as suggestions on the site form, not enforced by the column — a new
// kind of place shouldn't need a migration.
export const SITE_KINDS = ['canyon', 'climb', 'tower', 'water', 'structure', 'classroom'] as const
