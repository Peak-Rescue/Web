import { describe, expect, it } from 'vitest'
import type { SiteOption } from '@/app/admin/schedules/types'

// The rule the day's beta picker leads with. Lifted out here because it is
// the judgement, not the dropdown: which sites count as "where this course
// is" when the course says so three different ways and usually not the exact
// one.
const leads = (
  sites: SiteOption[],
  course: { venueId?: string | null; region?: string | null; location?: string | null }
) => {
  const loc = (course.location ?? '').toLowerCase().trim()
  return sites.filter((s) => {
    if (course.venueId) return s.venue_id === course.venueId
    if (course.region && s.venue_region === course.region) return true
    const venue = (s.venue_name ?? '').toLowerCase()
    return Boolean(loc && venue && (loc.includes(venue) || venue.includes(loc)))
  })
}

const site = (o: Partial<SiteOption>): SiteOption => ({
  id: 'x', name: 'A canyon', kind: 'canyon', beta: null, ...o,
})

const maui = site({ id: 'm', name: 'Emerald', venue_id: 'v-maui', venue_name: 'Maui', venue_region: 'US-HI' })
const wa = site({ id: 'w', name: 'Dingford', venue_id: 'v-ding', venue_name: 'Dingford Creek', venue_region: 'US-WA' })

describe('what the beta picker leads with', () => {
  it('uses the venue when the course has one', () => {
    expect(leads([maui, wa], { venueId: 'v-maui' }).map((s) => s.id)).toEqual(['m'])
  })

  it('falls back to the state, which nearly every course has', () => {
    // Five courses in eighty have a venue. Leading only for those is leading
    // for nobody.
    expect(leads([maui, wa], { region: 'US-WA' }).map((s) => s.id)).toEqual(['w'])
  })

  it('then to the location as it was typed', () => {
    expect(leads([maui, wa], { location: 'Dingford Creek, WA' }).map((s) => s.id)).toEqual(['w'])
  })

  it('leads with nothing rather than guessing, when the course says nothing', () => {
    expect(leads([maui, wa], {})).toEqual([])
  })

  it('does not let the state override an explicit venue', () => {
    // Two venues in Washington; the course named one of them.
    const other = site({ id: 'o', venue_id: 'v-leav', venue_name: 'Leavenworth', venue_region: 'US-WA' })
    expect(leads([wa, other], { venueId: 'v-ding', region: 'US-WA' }).map((s) => s.id)).toEqual(['w'])
  })
})
