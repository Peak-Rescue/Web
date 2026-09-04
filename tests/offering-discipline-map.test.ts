import { describe, it, expect } from 'vitest'
import { services } from '@/lib/data/services'
import { CATEGORY_COURSE_TYPES, courseCapabilityCategories } from '@/lib/capabilities'

// Offerings are marketing names; disciplines are the eleven internal skills.
// CATEGORY_COURSE_TYPES is the hand-maintained bridge between them, and there
// is no admin screen for either — an offering is added by editing the services
// array, which is a moment with nothing in it to remind you that a second file
// has to change too.
//
// Leaving an offering unmapped fails quietly and in two places at once: its
// courses match no discipline-tagged template on the shelf, and no instructor
// counts as qualified to staff it. Neither throws. This test is the reminder.
describe('every offering maps to a discipline', () => {
  const mapped = new Set(Object.values(CATEGORY_COURSE_TYPES).flat())

  it.each(services.map((s) => [s.slug, s.title] as const))(
    '%s (%s) is under at least one discipline',
    (slug) => {
      expect(courseCapabilityCategories(slug, null).length).toBeGreaterThan(0)
    }
  )

  // The other direction, which a rename breaks: the map still names the old
  // slug, so it silently covers an offering that no longer exists.
  it('names no offering that has been renamed or retired', () => {
    const real = new Set(services.map((s) => s.slug))
    expect([...mapped].filter((slug) => !real.has(slug))).toEqual([])
  })
})
