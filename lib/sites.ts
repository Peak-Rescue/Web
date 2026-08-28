// A site is a place a course actually happens at — a canyon, a crag, a tower —
// as opposed to a venue, which is the region a course is sold against.
//
// Its beta is the half that doesn't change between courses: approach, rap
// count, exit, hazards. A schedule day points at one and shows it live, so
// correcting a rap count corrects it everywhere. What is only true of one day
// stays in that day's notes.
//
// Where we meet sits here for the same reason. One meetup for Emerald Upper,
// another for Emerald Lower — it is decided by the place we are going into and
// is the same answer every time we go there, so holding it on the course meant
// retyping it per delivery and overwriting it every evening.

export type SiteLink = { url: string; label: string }

export type Site = {
  id: string
  venue_id: string | null
  name: string
  kind: string | null
  beta: string | null
  /** The meetup this place usually uses. A separate row because a meetup is
      often not a site at all — one trailhead serves several canyons, and we
      frequently gather where there is parking and carpool in from there. */
  meeting_point_id: string | null
  /** The hour we usually meet here — the approach length is a fact about the
      place. Offered to a day as a starting value; never announced from here. */
  usual_meeting_time: string | null
  /** The canyon's own coordinates. Where to *meet* lives on the meetup. */
  coords: string | null
  links: SiteLink[]
  active: boolean
}

// Offered as suggestions on the site form, not enforced by the column — a new
// kind of place shouldn't need a migration.
export const SITE_KINDS = ['canyon', 'climb', 'tower', 'water', 'structure', 'classroom'] as const

/** A place with a name and room to leave cars. Shared by every site that meets
    there, and frequently nowhere near the canyon itself. */
export type MeetingPointRecord = {
  id: string
  name: string
  venue_id: string | null
  directions: string | null
  coords: string | null
  links: SiteLink[]
  active: boolean
}
