import { describe, it, expect } from 'vitest'
import { announcesChanges, countAddresses, notifyCountsFrom, courseMatchesAlertPrefs } from '@/lib/course-notify'
import { CAPABILITY_ORDER } from '@/lib/capabilities'

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

// New-course alerts go to admins under the opposite rule to the one above:
// a tentative course is exactly what they need early.
//
// Held as mutes — what the admin has *un*ticked — so that a discipline added
// next month arrives switched on rather than silently missing from every list
// ever saved. Empty means a full inbox.
describe('who hears about a new course', () => {
  const canyonMilitary = { disciplines: ['canyoning'], sector: 'military' as const }
  const swiftCivilian = { disciplines: ['swift_water'], sector: 'civilian' as const }
  const nothingMuted = { disciplines: [], sectors: [] }

  it('sends everything to an admin who has unticked nothing', () => {
    expect(courseMatchesAlertPrefs(canyonMilitary, nothingMuted)).toBe(true)
    expect(courseMatchesAlertPrefs(swiftCivilian, nothingMuted)).toBe(true)
  })

  it('drops a muted sector and keeps the other', () => {
    const noCivilian = { disciplines: [], sectors: ['civilian'] }
    expect(courseMatchesAlertPrefs(canyonMilitary, noCivilian)).toBe(true)
    expect(courseMatchesAlertPrefs(swiftCivilian, noCivilian)).toBe(false)
  })

  it('drops a muted discipline and keeps the others', () => {
    const noCanyon = { disciplines: ['canyoning'], sectors: [] }
    expect(courseMatchesAlertPrefs(canyonMilitary, noCanyon)).toBe(false)
    expect(courseMatchesAlertPrefs(swiftCivilian, noCanyon)).toBe(true)
  })

  // The two rows are read together, so unticking Military drops a military
  // canyon course even with Canyon left ticked.
  it('lets either row veto on its own', () => {
    const noMilitary = { disciplines: [], sectors: ['military'] }
    expect(courseMatchesAlertPrefs(canyonMilitary, noMilitary)).toBe(false)
    expect(courseMatchesAlertPrefs({ disciplines: ['canyoning'], sector: 'civilian' }, noMilitary)).toBe(true)
  })

  // A course covered by several disciplines survives until every one of them
  // is muted — rope rescue is industry and rope access both.
  it('keeps a course while any one of its disciplines is still ticked', () => {
    const ropeRescue = { disciplines: ['industry', 'rope_access'], sector: 'civilian' as const }
    expect(courseMatchesAlertPrefs(ropeRescue, { disciplines: ['industry'], sectors: [] })).toBe(true)
    expect(courseMatchesAlertPrefs(ropeRescue, { disciplines: ['industry', 'rope_access'], sectors: [] })).toBe(false)
  })

  // A course tagged with no discipline — an internal planning day — has
  // nothing for the discipline row to weigh, so it arrives unless the row has
  // been cleared outright.
  it('sends an untagged course to anyone who still has a discipline ticked', () => {
    const internal = { disciplines: [], sector: 'civilian' as const }
    expect(courseMatchesAlertPrefs(internal, nothingMuted)).toBe(true)
    expect(courseMatchesAlertPrefs(internal, { disciplines: ['canyoning'], sectors: [] })).toBe(true)
  })

  // Clearing a whole row is how an admin turns alerts off, and it has to
  // silence the untagged courses too — there is no box left to stop them with.
  it('goes quiet when a whole row is cleared', () => {
    const noDisciplines = { disciplines: [...CAPABILITY_ORDER], sectors: [] }
    expect(courseMatchesAlertPrefs(canyonMilitary, noDisciplines)).toBe(false)
    expect(courseMatchesAlertPrefs({ disciplines: [], sector: 'civilian' }, noDisciplines)).toBe(false)

    const noSectors = { disciplines: [], sectors: ['civilian', 'military'] }
    expect(courseMatchesAlertPrefs(canyonMilitary, noSectors)).toBe(false)
    expect(courseMatchesAlertPrefs(swiftCivilian, noSectors)).toBe(false)
  })
})
