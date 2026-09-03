import { describe, it, expect } from 'vitest'
import { announcesChanges, countAddresses, notifyCountsFrom } from '@/lib/course-notify'

// The number on the button is a promise made before something that cannot be
// taken back, so it is counted by address and never by head.
describe('notify counts', () => {
  it('counts one inbox once, however it was capitalised or spaced', () => {
    expect(countAddresses([' Ann@x.com ', 'ANN@x.com', 'ann@x.com'], null).size).toBe(1)
  })

  it('drops your own address — nobody is emailed their own post', () => {
    expect(countAddresses(['ann@x.com', 'me@x.com'], 'ME@x.com').size).toBe(1)
  })

  it('ignores missing addresses rather than counting them', () => {
    expect(countAddresses(['ann@x.com', null, undefined, ''], null).size).toBe(1)
  })

  // An instructor who is also enrolled is one inbox, which is why `everyone`
  // is its own union rather than the two groups added together.
  it('does not double-count someone who is both student and instructor', () => {
    const counts = notifyCountsFrom(['ann@x.com', 'bo@x.com'], ['ann@x.com', 'cy@x.com'], null)
    expect(counts.students).toBe(2)
    expect(counts.instructors).toBe(2)
    expect(counts.everyone).toBe(3)
    expect(counts.everyone).not.toBe(counts.students + counts.instructors)
  })

  it('excludes the author from every group at once', () => {
    const counts = notifyCountsFrom(['me@x.com', 'bo@x.com'], ['me@x.com'], 'me@x.com')
    expect(counts).toEqual({ students: 1, instructors: 0, everyone: 1 })
  })
})

// A tentative course is a proposal. Its dates move while the client decides,
// and every automatic notice about it stays unsent until it is confirmed.
describe('which courses announce their changes', () => {
  it('stays quiet for a course that is not yet real', () => {
    expect(announcesChanges('tentative')).toBe(false)
    expect(announcesChanges('quoted')).toBe(false)
  })

  it('announces once the course is confirmed, and after it has run', () => {
    expect(announcesChanges('confirmed')).toBe(true)
    expect(announcesChanges('completed')).toBe(true)
  })

  // Cancelling a cancelled course, and a status that never loaded, both mean
  // nothing new to say.
  it('says nothing for an already-cancelled or unknown course', () => {
    expect(announcesChanges('cancelled')).toBe(false)
    expect(announcesChanges(null)).toBe(false)
    expect(announcesChanges(undefined)).toBe(false)
  })
})
