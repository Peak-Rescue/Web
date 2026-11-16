import { describe, it, expect } from 'vitest'
import { isJob } from '@/lib/courses'
import { seedsNothing } from '@/lib/estimates'

describe('isJob', () => {
  it('reads a typed job off its offering, whatever the flag says', () => {
    expect(isJob('standby-rescue')).toBe(true)
    expect(isJob('standby-rescue', false)).toBe(true)
  })

  it('reads a custom booking off its flag', () => {
    expect(isJob('custom')).toBe(false)
    expect(isJob('custom', true)).toBe(true)
  })

  it('ignores the flag once a booking is retyped to a course', () => {
    expect(isJob('rope-rescue', true)).toBe(false)
  })
})

describe('seedsNothing', () => {
  it('leaves only a custom job to be priced by hand', () => {
    expect(seedsNothing({ course_type: 'custom', job: true })).toBe(true)
    expect(seedsNothing({ course_type: 'custom', job: false })).toBe(false)
    expect(seedsNothing({ course_type: 'standby-rescue', job: true })).toBe(false)
  })
})
