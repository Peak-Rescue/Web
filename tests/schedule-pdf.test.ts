import { describe, it, expect } from 'vitest'
import { generateSchedulePdf, type SchedulePdfDay } from '@/lib/schedule-pdf'

// The sheet that goes in the van pocket. A PDF is binary and the build cannot
// see inside it, so this exists to catch the day the drawing code throws.
const meetup = {
  id: 'm1', name: 'Hanawi lower lot',
  directions: 'Gate past mile 12, park along the fence',
  coords: '20.7988, -156.1193',
  links: null,
}

function day(over: Partial<SchedulePdfDay> = {}): SchedulePdfDay {
  return {
    id: 'd1', title: 'Day 1', location: 'Maui', notes: null, objectives: [],
    sites: { name: 'Emerald Canyon (Upper)', beta: 'Approach 1–2h.', usual_meeting_time: '0530', meeting_points: meetup },
    meeting_point: null, meeting_time: '0900', meeting_points: null,
    sort_order: 0, schedule_blocks: [],
    ...over,
  }
}

const sheet = (days: SchedulePdfDay[]) => generateSchedulePdf({
  courseTitle: 'Canyon Mobility', courseSubtitle: 'Maui', scheduleName: 'Course schedule',
  overview: null, objectives: [], days,
})

describe('generateSchedulePdf', () => {
  it('produces a PDF with the morning on it', async () => {
    const bytes = await sheet([day()])
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe('%PDF-')
    expect(bytes.length).toBeGreaterThan(1000)
  })

  it('draws a day whose meeting is inherited from the site’s meetup', async () => {
    await expect(sheet([day()])).resolves.toBeDefined()
  })

  it('draws a day that overrode the meetup in its own words', async () => {
    await expect(sheet([day({ meeting_point: 'Meet at the shop first' })])).resolves.toBeDefined()
  })

  it('draws a day with no morning at all', async () => {
    await expect(sheet([day({
      meeting_time: null,
      sites: { name: 'Knucklehead', beta: null, usual_meeting_time: null, meeting_points: null },
    })])).resolves.toBeDefined()
  })

  it('draws a day with no site', async () => {
    await expect(sheet([day({ sites: null, meeting_time: null })])).resolves.toBeDefined()
  })
})
