import { describe, expect, it } from 'vitest'
import { albumMatches, albumSubtitle, albumTitle, inheritedDisciplines, type AlbumCourse, type MediaAlbum } from '@/lib/media'

const course = (over: Partial<AlbumCourse> = {}): AlbumCourse => ({
  id: 'c1',
  course_type: 'canyoneering',
  custom_title: null,
  custom_categories: null,
  location: 'Maui, HI',
  client_name: null,
  starts_at: '2026-03-02',
  ends_at: '2026-03-06',
  ref_number: 412,
  ...over,
})

const album = (over: Partial<MediaAlbum> = {}): MediaAlbum => ({
  instanceId: 'c1',
  title: 'Canyon Mobility · PR-0412',
  subtitle: 'Mar 2, 2026 – Mar 6, 2026 · Maui, HI',
  folderUrl: null,
  count: 23,
  latest: '2026-03-06',
  disciplines: ['canyoning'],
  courseType: 'canyoneering',
  location: 'Maui, HI',
  startsAt: '2026-03-02',
  ...over,
})

describe('album tags are inherited, not typed', () => {
  it('takes its disciplines from the course, so nobody tags a photo', () => {
    // The whole point: nobody ever tagged the Maui photos as canyon work.
    expect(inheritedDisciplines(course())).toContain('canyoning')
  })

  it('follows the course when the course is re-typed', () => {
    expect(inheritedDisciplines(course({ course_type: 'swiftwater-rescue' }))).toContain('swift_water')
  })

  it('reads a custom course off the boxes it was set up with', () => {
    expect(
      inheritedDisciplines(course({ course_type: 'custom', custom_categories: ['rope_access'] }))
    ).toContain('rope_access')
  })
})

describe('finding an album', () => {
  it('matches on inherited disciplines across every album at once', () => {
    expect(albumMatches(album(), 'canyoning')).toBe(true)
    expect(albumMatches(album(), 'swift_water')).toBe(false)
  })

  it('matches on where it was, since that is how a trip is remembered', () => {
    expect(albumMatches(album(), null, 'maui')).toBe(true)
    expect(albumMatches(album(), null, 'leavenworth')).toBe(false)
  })

  it('names the course and the dates', () => {
    expect(albumTitle(course())).toBe('Canyon Mobility · PR-0412')
    expect(albumSubtitle(course())).toContain('Maui, HI')
    expect(albumSubtitle(course({ starts_at: null, ends_at: null }))).toContain('dates TBD')
  })
})
