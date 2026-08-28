// The running order as a sheet to carry: the overview, the course objectives,
// then a day per day with its place, its notes, what it's for and what it
// consists of.
//
// Times live in a narrow left gutter rather than inline, because half our
// schedules don't use them — inline, the timed days and the untimed ones read
// as two different documents, and in a gutter the untimed ones are simply a
// column of blank space nobody notices.

import { CONTENT_W, FAINT, INK, MARGIN, MUTED, PdfBuilder, RED } from '@/lib/pdf-layout'
import { resolveDayMeeting } from '@/lib/meeting-details'

export type SchedulePdfBlock = {
  id: string
  parent_id: string | null
  title: string
  time_label: string | null
  location: string | null
  sort_order: number
}

/** A meetup, as the sheet needs it: what it is called, how to find it, and the
    pin — coordinates earn their place on paper in a way a URL never does. */
export type SchedulePdfMeetup = {
  id: string
  name: string
  directions: string | null
  coords: string | null
  links: null
}

export type SchedulePdfSite = {
  name: string
  beta: string | null
  usual_meeting_time: string | null
  meeting_points: SchedulePdfMeetup | null
}

export type SchedulePdfDay = {
  id: string
  title: string
  location: string | null
  sites: SchedulePdfSite | null
  meeting_point: string | null
  meeting_time: string | null
  meeting_points: SchedulePdfMeetup | null
  notes: string | null
  objectives: string[] | null
  sort_order: number
  schedule_blocks: SchedulePdfBlock[]
}

export type SchedulePdf = {
  courseTitle: string
  courseSubtitle: string | null
  scheduleName: string
  overview: string | null
  objectives: string[]
  days: SchedulePdfDay[]
}

const TIME_W = 54 // the gutter times sit in, right-aligned against the topics
const BODY_X = MARGIN + TIME_W

export async function generateSchedulePdf(data: SchedulePdf): Promise<Uint8Array> {
  const b = await PdfBuilder.create({
    title: data.courseTitle,
    subtitle: data.courseSubtitle,
    kind: data.scheduleName || 'Running order',
  })

  if (data.overview) {
    b.paragraph(data.overview, { size: 9.5, color: MUTED, paragraphs: true })
    b.y -= 10
  }

  if (data.objectives.length > 0) {
    b.sectionHeading('Course objectives')
    data.objectives.forEach((o, i) => {
      const label = `${i + 1}.`
      b.ensure(b.measure(o, { width: CONTENT_W - 20, size: 9.5, leading: 13 }) + 4)
      b.text(label, { x: MARGIN, size: 9.5, color: FAINT })
      b.paragraph(o, { x: MARGIN + 20, width: CONTENT_W - 20, size: 9.5, leading: 13 })
      b.y -= 4
    })
    b.y -= 10
  }

  const days = [...data.days].sort((a, c) => a.sort_order - c.sort_order)

  days.forEach((day, di) => {
    const blocks = [...(day.schedule_blocks ?? [])].sort((a, c) => a.sort_order - c.sort_order)
    const topics = blocks.filter((t) => !t.parent_id)

    // The counter only earns its place when the title says something else —
    // most days are called "Day 1", and printing that twice is just noise.
    const numbered = /^day\s*\d+\b/i.test(day.title.trim())
    const heading = numbered ? day.title : `Day ${di + 1} — ${day.title}`

    // A day's heading stays with the start of the day. Reserving the heading
    // plus its place line plus the first topic is enough: a day that runs long
    // then breaks at a topic boundary, which is where a break reads as fine.
    b.ensure(46)
    b.text(heading.toUpperCase(), { size: 10.5, bold: true, color: INK })
    b.y -= 7
    b.hairline()
    b.y -= 14

    // A day that runs past the foot of the page names itself again at the top
    // of the next one — a bare list of times under a running head could be any
    // day of the week.
    b.continued = () => {
      b.text(`${heading} (continued)`.toUpperCase(), { size: 10.5, bold: true, color: INK })
      b.y -= 7
      b.hairline()
      b.y -= 14
    }

    // The morning, before anywhere else the day goes. This is the sheet in
    // the van pocket, read at 0500 by someone who has not opened the portal —
    // so where to gather and when belongs on it, ahead of the canyon.
    //
    // Links are deliberately left off. On paper a label with no address is
    // useless and the address is two hundred characters of query string; the
    // coordinates are the part you can actually act on with a phone in a
    // cradio dead spot.
    const meeting = resolveDayMeeting(day, day.sites)
    if (meeting.time || meeting.point || meeting.placeName) {
      b.text('Meet', { x: MARGIN, size: 7.5, color: RED })
      const headline = [meeting.time, meeting.placeName].filter(Boolean).join('  ·  ')
      if (headline) {
        b.paragraph(headline, { x: BODY_X, width: CONTENT_W - TIME_W, size: 9.5, leading: 12, color: MUTED })
      }
      if (meeting.point) {
        b.paragraph(meeting.point, { x: BODY_X, width: CONTENT_W - TIME_W, size: 9, leading: 12, color: MUTED, paragraphs: true })
      }
      if (meeting.coords) {
        b.paragraph(meeting.coords, { x: BODY_X, width: CONTENT_W - TIME_W, size: 8.5, leading: 11, color: FAINT })
      }
      b.y -= 2
    }
    if (day.location) {
      b.text('Where', { x: MARGIN, size: 7.5, color: FAINT })
      b.paragraph(day.location, { x: BODY_X, width: CONTENT_W - TIME_W, size: 9, leading: 12, color: MUTED })
      b.y -= 2
    }
    // The place's own beta, before the day's note about it — the sheet that
    // goes in the van pocket is the one people read at the trailhead, so the
    // approach and the rap count have to be on it, not just on the screen.
    if (day.sites?.beta) {
      b.text('Beta', { x: MARGIN, size: 7.5, color: FAINT })
      b.paragraph(day.sites.beta, { x: BODY_X, width: CONTENT_W - TIME_W, size: 9, leading: 12, color: MUTED, paragraphs: true })
      b.y -= 2
    }
    if (day.notes) {
      b.text('Note', { x: MARGIN, size: 7.5, color: RED })
      b.paragraph(day.notes, { x: BODY_X, width: CONTENT_W - TIME_W, size: 9, leading: 12, color: MUTED, paragraphs: true })
      b.y -= 2
    }

    const objectives = day.objectives ?? []
    if (objectives.length > 0) {
      b.ensure(16)
      b.text('Aims', { x: MARGIN, size: 7.5, color: FAINT })
      for (const o of objectives) {
        b.ensure(13)
        b.text('·', { x: BODY_X, size: 9, color: FAINT })
        b.paragraph(o, { x: BODY_X + 8, width: CONTENT_W - TIME_W - 8, size: 9, leading: 12, color: MUTED })
      }
      b.y -= 2
    }

    if (topics.length > 0) b.y -= 4

    for (const topic of topics) {
      const kids = blocks.filter((k) => k.parent_id === topic.id)
      const suffix = topic.location ? `  (${topic.location})` : ''
      const line = `${topic.title}${suffix}`
      const width = CONTENT_W - TIME_W

      b.ensure(b.measure(line, { width, size: 9.5, leading: 12.5 }) + 6)
      if (topic.time_label) {
        // Right-aligned against the topic it belongs to, so the times form a
        // clean edge down the page instead of a ragged one.
        const t = topic.time_label
        b.text(t, {
          x: BODY_X - 10 - b.font.widthOfTextAtSize(t, 8.5),
          size: 8.5,
          color: MUTED,
        })
      }
      b.paragraph(line, { x: BODY_X, width, size: 9.5, leading: 12.5 })

      for (const kid of kids) {
        const kidLine = `${kid.time_label ? `${kid.time_label}  ` : ''}${kid.title}${kid.location ? `  (${kid.location})` : ''}`
        b.ensure(12)
        b.text('–', { x: BODY_X + 10, size: 9, color: FAINT })
        b.paragraph(kidLine, { x: BODY_X + 20, width: width - 20, size: 8.5, leading: 11.5, color: MUTED })
      }
      b.y -= 5
    }

    b.continued = null
    b.y -= 12
  })

  if (days.length === 0) {
    b.paragraph('No days have been added to this schedule yet.', { size: 10, color: MUTED })
  }

  b.ensure(24)
  b.y -= 2
  b.hairline()
  b.y -= 12
  b.text(
    `Printed ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })} — the course portal has the current running order.`,
    { size: 7.5, color: FAINT }
  )

  return b.save()
}
