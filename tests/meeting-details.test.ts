import { describe, it, expect } from 'vitest'
import {
  resolveDayMeeting, meetingDayLabel, meetingDayPassed,
} from '@/lib/meeting-details'

// The chain that decides what a morning says. Four possible answers, and the
// bug it exists to prevent is the words coming from one of them while the pin
// and the links come from another.
describe('resolveDayMeeting', () => {
  const meetup = {
    id: 'm1', name: 'Hanawi lower lot',
    directions: 'Gate past mile 12, park along the fence',
    coords: '20.79,-156.11',
    links: [{ url: 'https://maps.example/pin', label: 'driving pin' }],
  }
  const site = {
    name: 'Emerald Canyon (Upper)',
    usual_meeting_time: '0530',
    links: [{ url: 'https://ropewiki.example/emerald', label: 'ropewiki' }],
    meeting_points: meetup,
  }

  it('falls back to the site’s usual meetup when the day says nothing', () => {
    const m = resolveDayMeeting({}, site)
    expect(m.pointFrom).toBe('site-meetup')
    expect(m.placeName).toBe('Hanawi lower lot')
    expect(m.point).toBe(meetup.directions)
    expect(m.coords).toBe('20.79,-156.11')
  })

  it('prefers a meetup the day picked over the site’s usual', () => {
    const other = { ...meetup, id: 'm2', name: 'Costco lot', directions: 'Back row by the pumps', coords: '20.88,-156.47', links: [] }
    const m = resolveDayMeeting({ meeting_points: other }, site)
    expect(m.pointFrom).toBe('day-meetup')
    expect(m.placeName).toBe('Costco lot')
    expect(m.coords).toBe('20.88,-156.47')
  })

  it('lets the day’s own words beat every meetup', () => {
    const m = resolveDayMeeting({ meeting_point: 'Meet at the shop first' }, site)
    expect(m.pointFrom).toBe('day')
    expect(m.point).toBe('Meet at the shop first')
  })

  it('falls all the way through to the course when there is no schedule answer', () => {
    const m = resolveDayMeeting({}, null, { meeting_point: 'Trailhead, 0900' })
    expect(m.pointFrom).toBe('course')
    expect(m.point).toBe('Trailhead, 0900')
  })

  it('reports no answer rather than an empty one', () => {
    const m = resolveDayMeeting({}, null, null)
    expect(m.pointFrom).toBeNull()
    expect(m.point).toBeNull()
  })

  // The whole reason the chain resolves once instead of field by field.
  it('takes the name, pin and links from whichever answer won', () => {
    const own = resolveDayMeeting({ meeting_point: 'Meet at the shop' }, site)
    expect(own.placeName).toBeNull()
    expect(own.coords).toBeNull()
  })

  it('never inherits the hour — it is offered, not resolved', () => {
    const m = resolveDayMeeting({}, site)
    expect(m.time).toBeNull()
    expect(m.usualTime).toBe('0530')
  })

  it('puts the meetup’s links before the canyon’s', () => {
    const m = resolveDayMeeting({}, site)
    expect(m.links.map((l) => l.label)).toEqual(['driving pin', 'ropewiki'])
  })

  it('treats whitespace as unset', () => {
    const m = resolveDayMeeting({ meeting_point: '   ', meeting_time: '  ' }, null, null)
    expect(m.point).toBeNull()
    expect(m.time).toBeNull()
  })
})

describe('meetingDayLabel', () => {
  it('falls back to the course start when no day is set', () => {
    expect(meetingDayLabel(null, '2026-08-24')).toBe('Monday, August 24')
  })
  it('uses the short form for an email subject', () => {
    expect(meetingDayLabel('2026-08-28', null, 'short')).toBe('Fri, Aug 28')
  })
  it('has nothing to say when neither date exists', () => {
    expect(meetingDayLabel(null, null)).toBeNull()
  })
})

describe('meetingDayPassed', () => {
  const today = new Date()
  const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  const shift = (days: number) => iso(new Date(today.getTime() + days * 86_400_000))

  // Over, not started: the old test folded the block at midnight on the
  // morning of, which is the hour it exists for.
  it('is still ahead of us on the morning itself', () => {
    expect(meetingDayPassed(shift(0), null)).toBe(false)
  })
  it('is behind us the day after', () => {
    expect(meetingDayPassed(shift(-1), null)).toBe(true)
  })
  it('reads the meeting day, not the course start', () => {
    expect(meetingDayPassed(shift(1), shift(-5))).toBe(false)
  })
})
