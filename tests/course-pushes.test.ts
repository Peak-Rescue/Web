import { describe, it, expect } from 'vitest'
import { reaches, unseenSections, lastPushToStudents, behindOnPush, type Push } from '@/lib/course-pushes'

const push = (o: Partial<Push> & { pushed_at: string }): Push => ({
  section: 'schedule',
  audience: 'everyone',
  pushed_by: null,
  ...o,
})

describe('who a notice reaches', () => {
  it('sends everyone to everyone', () => {
    expect(reaches('everyone', true)).toBe(true)
    expect(reaches('everyone', false)).toBe(true)
  })

  it('keeps a crew-only notice off a student page', () => {
    expect(reaches('instructors', true)).toBe(false)
    expect(reaches('instructors', false)).toBe(true)
  })

  it('keeps a students-only notice off the crew bar', () => {
    expect(reaches('students', true)).toBe(true)
    expect(reaches('students', false)).toBe(false)
  })
})

describe('the dot on a door', () => {
  const reader = { lastSeenAt: '2026-09-01T00:00:00Z', userId: 'me', isStudent: true }

  it('marks the door a notice was sent behind', () => {
    const s = unseenSections([push({ pushed_at: '2026-09-02T00:00:00Z', section: 'schedule' })], reader)
    expect([...s]).toEqual(['schedule'])
  })

  it('says nothing about a notice that predates your visit', () => {
    const s = unseenSections([push({ pushed_at: '2026-08-30T00:00:00Z' })], reader)
    expect(s.size).toBe(0)
  })

  it('does not tell you about your own send', () => {
    const s = unseenSections([push({ pushed_at: '2026-09-02T00:00:00Z', pushed_by: 'me' })], reader)
    expect(s.size).toBe(0)
  })

  it('does not leak a crew-only notice to a student', () => {
    const s = unseenSections([push({ pushed_at: '2026-09-02T00:00:00Z', audience: 'instructors' })], reader)
    expect(s.size).toBe(0)
    const crew = unseenSections([push({ pushed_at: '2026-09-02T00:00:00Z', audience: 'instructors' })],
      { ...reader, isStudent: false })
    expect(crew.size).toBe(1)
  })

  it('marks nothing on a first visit — you cannot be behind on a page you have never opened', () => {
    const s = unseenSections([push({ pushed_at: '2026-09-02T00:00:00Z' })], { ...reader, lastSeenAt: null })
    expect(s.size).toBe(0)
  })

  it('marks every door that had something sent behind it', () => {
    const s = unseenSections([
      push({ pushed_at: '2026-09-02T00:00:00Z', section: 'schedule' }),
      push({ pushed_at: '2026-09-03T00:00:00Z', section: 'updates' }),
    ], reader)
    expect([...s].sort()).toEqual(['schedule', 'updates'])
  })
})

describe('who on the roster is behind', () => {
  const pushes = [
    push({ pushed_at: '2026-09-02T00:00:00Z', audience: 'everyone' }),
    push({ pushed_at: '2026-09-04T00:00:00Z', audience: 'instructors' }),
  ]

  it('measures against the last notice students actually got', () => {
    // not the crew-only one two days later
    expect(lastPushToStudents(pushes)).toBe('2026-09-02T00:00:00Z')
  })

  it('marks somebody who has not been back since', () => {
    expect(behindOnPush('2026-09-01T00:00:00Z', lastPushToStudents(pushes))).toBe(true)
  })

  it('leaves somebody who has been back alone', () => {
    expect(behindOnPush('2026-09-03T00:00:00Z', lastPushToStudents(pushes))).toBe(false)
  })

  it('counts never-opened-it as behind', () => {
    expect(behindOnPush(null, lastPushToStudents(pushes))).toBe(true)
  })

  it('marks nobody when nothing has been sent', () => {
    expect(behindOnPush(null, lastPushToStudents([]))).toBe(false)
    expect(behindOnPush('2026-01-01T00:00:00Z', null)).toBe(false)
  })
})
