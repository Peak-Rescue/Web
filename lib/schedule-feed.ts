// One person's field days, as a calendar anyone can subscribe to.
//
// This is the only thing the portal publishes about a course to someone with
// no relationship to Peak Rescue, so it says the least that is still useful:
// what kind of course it is, the town, and which days. No client, no contact,
// no meeting point, no notes, no link back into the portal. A partner reading
// it learns which weeks he is gone and roughly where — which is the whole
// question — and a stranger who guesses the URL learns nothing they could use.

import { computeBlocks, courseShortName, type OffDayRange } from '@/lib/courses'

export type FeedCourse = {
  id: string
  course_type: string
  custom_title: string | null
  location: string | null
  status: string
  starts_at: string | null
  ends_at: string | null
  off_days: OffDayRange[]
  // Their own first and last field day, when those are not the course's.
  // Null follows the course — see course_pay_rates, which is where a person's
  // own week is recorded because the overtime arithmetic runs on it.
  own_starts_at?: string | null
  own_ends_at?: string | null
}

const ESCAPES: Record<string, string> = { '\\': '\\\\', ';': '\\;', ',': '\\,', '\n': '\\n' }

const esc = (s: string) => s.replace(/[\\;,\n]/g, (c) => ESCAPES[c])

// RFC 5545 counts the 75 octets, not characters, and a fold must never land
// inside a UTF-8 sequence — an em dash in a course name is three of them.
function fold(line: string): string {
  const bytes = Buffer.from(line, 'utf8')
  if (bytes.length <= 75) return line
  const parts: string[] = []
  let at = 0
  let limit = 75
  while (at < bytes.length) {
    let take = Math.min(limit, bytes.length - at)
    while (take > 1 && (bytes[at + take] & 0xc0) === 0x80) take--
    parts.push(bytes.subarray(at, at + take).toString('utf8'))
    at += take
    limit = 74 // continuation lines are indented by one space
  }
  return parts.join('\r\n ')
}

const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')

/** Day after `date`, which is what an all-day DTEND has to be: exclusive. */
function dayAfter(date: string): string {
  return new Date(Date.parse(date + 'T00:00:00Z') + 86_400_000).toISOString().slice(0, 10)
}

const compact = (date: string) => date.replace(/-/g, '')

/** The window this person actually works, which is the course's unless their
    own row says otherwise. A start after the end is a half-finished edit, not
    an instruction — fall back rather than emit an inside-out event. */
function window(c: FeedCourse): { starts_at: string; ends_at: string } | null {
  if (!c.starts_at) return null
  const courseStart = c.starts_at
  const courseEnd = c.ends_at ?? c.starts_at
  const start = c.own_starts_at ?? courseStart
  const end = c.own_ends_at ?? courseEnd
  return end < start ? { starts_at: courseStart, ends_at: courseEnd } : { starts_at: start, ends_at: end }
}

export function buildScheduleIcs(
  courses: FeedCourse[],
  opts: { calendarName: string; now: Date }
): string {
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Peak Rescue//Portal Schedule//EN',
    'CALSCALE:GREGORIAN',
    `X-WR-CALNAME:${esc(opts.calendarName)}`,
    // Both spellings: the standard one, and the Outlook/Google-era one that
    // predates it. Google honours neither closely — it refetches when it
    // refetches, which is why the link is described as a daily feed.
    'REFRESH-INTERVAL;VALUE=DURATION:PT12H',
    'X-PUBLISHED-TTL:PT12H',
  ]

  const dtstamp = stamp(opts.now)

  for (const c of courses) {
    // A cancelled course is not a week you are away; a dateless one is not yet
    // a week at all.
    if (c.status === 'cancelled') continue
    const w = window(c)
    if (!w) continue

    const tentative = c.status === 'tentative' || c.status === 'quoted'
    const summary =
      // Trimmed: a catalog title with a stray trailing space is invisible in
      // the portal and reads as a double space in someone else's calendar.
      [courseShortName(c.course_type, c.custom_title), c.location]
        .filter(Boolean)
        .map((s) => s!.trim())
        .join(' — ') +
      (tentative ? ' (tentative)' : '')

    // A course with days off in the middle is two trips home, not one long
    // one, and a partner's calendar is exactly where that difference shows.
    const blocks = computeBlocks(w.starts_at, w.ends_at, c.off_days)
    blocks.forEach((b, i) => {
      lines.push(
        'BEGIN:VEVENT',
        // Stable across refetches so a moved course updates the event in place
        // instead of arriving beside the old one.
        `UID:${c.id}-${i}@peak-rescue.com`,
        `DTSTAMP:${dtstamp}`,
        `DTSTART;VALUE=DATE:${compact(b.starts_at)}`,
        `DTEND;VALUE=DATE:${compact(dayAfter(b.ends_at))}`,
        `SUMMARY:${esc(summary)}`,
        ...(c.location ? [`LOCATION:${esc(c.location)}`] : []),
        `STATUS:${tentative ? 'TENTATIVE' : 'CONFIRMED'}`,
        'END:VEVENT'
      )
    })
  }

  lines.push('END:VCALENDAR')
  return lines.map(fold).join('\r\n') + '\r\n'
}
