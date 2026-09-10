export type MeetingLink = { label: string; url: string }
export type MeetingFile = { path: string; filename: string; url: string }

// The day the plan is for, in words.
//
// A schedule day has no date of its own — it is the Nth date the course runs —
// so the caller works the date out and passes it in, which is why a course
// whose dates move carries its mornings along with it. `startsAt` is the
// fallback for a caller that has no date at all.
//
// Long form heads the block and the announcement; short form goes in an email
// subject, where it sits beside the course name and has to earn its width.
export function meetingDayLabel(
  meetingDate: string | null,
  startsAt: string | null,
  form: 'long' | 'short' = 'long'
): string | null {
  const iso = meetingDate ?? startsAt
  if (!iso) return null
  return new Date(`${iso}T00:00:00`).toLocaleDateString('en-US',
    form === 'long'
      ? { weekday: 'long', month: 'long', day: 'numeric' }
      : { weekday: 'short', month: 'short', day: 'numeric' })
}

// Whether the meeting day is behind us.
//
// A day is the most important thing on the page right up until the moment it
// is over, and dead weight from then on — so the day card folds itself away
// once that day has passed, carrying its morning and its beta with it. This is
// the only date-driven fold on a schedule: the blocks inside a day no longer
// keep one of their own.
//
// Over, not started: the old test folded the block at midnight *on* the
// morning of, which is the hour it exists for. And it read the course start
// rather than the meeting day, so a plan set for Wednesday on a course that
// began Monday arrived already folded.
//
// Compared as plain YYYY-MM-DD strings against the local day, because "is that
// day behind us" is a question about the calendar and not about the hour.
export function meetingDayPassed(meetingDate: string | null, startsAt: string | null): boolean {
  const day = meetingDate ?? startsAt
  if (!day) return false
  const now = new Date()
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  return day < today
}

// ─── The day's meeting plan ─────────────────────────────────────────────────

/** A meetup: a place with parking and a name, which is not always a place we
    are going. One trailhead serves several canyons, and often we gather
    somewhere with room to leave cars and carpool in from there. */
export type MeetingPoint = {
  id: string
  name: string
  directions: string | null
  coords: string | null
  links: MeetingLink[] | null
}

export type MeetingSource = 'day' | 'day-meetup' | 'site-meetup' | 'course'

export type DayMeeting = {
  /** What the meetup is called, when the answer came from one. The directions
      alone are a paragraph; the name is what fits in a sentence. */
  placeName: string | null
  /** The words someone reads at 0500 — the meetup's directions, or the day's
      own if it overrode them. */
  point: string | null
  pointFrom: MeetingSource | null
  /** The hour announced for this day, and only ever the day's own. */
  time: string | null
  /** What we usually do at this site. Offered when setting a day, never
      resolved into `time` — an approach length is a fact about the place, but
      daylight, tides and the group move the hour, and a default that
      announces itself is a default nobody checked.

      On the site rather than the meetup on purpose: when three canyons meet at
      one lot, the hour follows the canyon you are facing.

      (A day once had its own note field beside these. Nobody wrote in it: what
      it was for — the shuttle, the gate code, who is driving — is what people
      already put in the meeting point itself, and a second prose box beside
      the first is a choice nobody wants to make at 0500.) */
  usualTime: string | null
  coords: string | null
  /** Getting there first, then the descent: the meetup's driving pin and gate
      code, then the canyon's Ropewiki, Mountain Project and gauge. */
  links: MeetingLink[]
  /** The winning meetup's own links, without the canyon's. The portal draws
      the two rows in two places — the driving pin belongs to the morning and
      the gauge belongs to the descent — so it needs the halves apart. */
  pointLinks: MeetingLink[]
  siteName: string | null
}

type DayRow = {
  meeting_point?: string | null
  meeting_time?: string | null
  meeting_points?: MeetingPoint | null
}
type SiteRow = {
  name?: string | null
  usual_meeting_time?: string | null
  links?: MeetingLink[] | null
  meeting_points?: MeetingPoint | null
}

const trim = (v: string | null | undefined) => {
  const t = v?.trim()
  return t ? t : null
}

/** The day's own words, then the meetup it picked, then the site's usual
    meetup, then the course. The course row is the floor for a course with no
    schedule at all, which is why it is still read here rather than retired. */
export function resolveDayMeeting(
  day: DayRow | null,
  site: SiteRow | null,
  course?: { meeting_point?: string | null; meeting_time?: string | null } | null
): DayMeeting {
  const dayWords = trim(day?.meeting_point)
  const dayMeetup = day?.meeting_points ?? null
  const siteMeetup = site?.meeting_points ?? null
  const courseWords = trim(course?.meeting_point)

  // One decision, made once, so that the words, the name, the pin and the
  // links can never come from different answers.
  const chosen: { from: MeetingSource; meetup: MeetingPoint | null; words: string | null } | null =
    dayWords ? { from: 'day', meetup: dayMeetup, words: dayWords }
    : dayMeetup ? { from: 'day-meetup', meetup: dayMeetup, words: trim(dayMeetup.directions) }
    : siteMeetup ? { from: 'site-meetup', meetup: siteMeetup, words: trim(siteMeetup.directions) }
    : courseWords ? { from: 'course', meetup: null, words: courseWords }
    : null

  return {
    placeName: chosen?.meetup ? trim(chosen.meetup.name) : null,
    point: chosen?.words ?? null,
    pointFrom: chosen?.from ?? null,
    time: trim(day?.meeting_time),
    usualTime: trim(site?.usual_meeting_time),
    coords: chosen?.meetup ? trim(chosen.meetup.coords) : null,
    links: [...(chosen?.meetup?.links ?? []), ...(site?.links ?? [])],
    pointLinks: chosen?.meetup?.links ?? [],
    siteName: trim(site?.name),
  }
}
