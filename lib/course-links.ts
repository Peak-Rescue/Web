// One-off links attached to a course.
//
// The distinction that matters: library items are material we expect to use
// again, filed with disciplines and topics so it can be found. These are links
// that mean something for one delivery — this course's photo album, this
// client's paperwork, this permit portal — and nothing for the next one.

export const LINK_PURPOSES = ['photos', 'resource', 'form', 'other'] as const
export type LinkPurpose = (typeof LINK_PURPOSES)[number]

// The library defaults to the pending queue, so anything pointing at a shelf
// has to ask for everything — a link that lands on an empty review list reads
// as "there's nothing there", which is the opposite of the point.
export const LIBRARY_HREF = '/admin/library?status=all'

export const PURPOSE_META: Record<
  LinkPurpose,
  { label: string; hint: string; verb: string }
> = {
  photos: {
    label: 'Photos',
    hint: 'A shared album for this course — everyone on the team can add to it',
    verb: 'Add an album',
  },
  resource: {
    label: 'Resources',
    hint: '',
    verb: 'Add a resource',
  },
  form: {
    label: 'Forms and paperwork',
    hint: '',
    verb: 'Add a form',
  },
  other: {
    label: 'Other links',
    hint: '',
    verb: 'Add a link',
  },
}

// Photos first: it's the one people come looking for after the course, and the
// only one that's usually student-facing.
export const PURPOSE_ORDER: LinkPurpose[] = ['photos', 'form', 'resource', 'other']

// The only purpose we invite here. A one-off document belongs in the course
// notes; anything we'd use twice belongs in the library, filed by discipline
// and topic, and reaches the course through the curriculum. Forms and
// resources still render if a course already has them — an old link shouldn't
// vanish just because we stopped offering the button.
export const OFFERED_PURPOSES: LinkPurpose[] = ['photos']

export type CourseLink = {
  id: string
  url: string
  label: string | null
  purpose: LinkPurpose
  audience: 'internal' | 'shared'
}

// A link with no label reads as its host — "photos.google.com" tells you more
// than a bare URL, and less than the name someone bothered to type.
export function linkLabel(link: Pick<CourseLink, 'label' | 'url'>): string {
  if (link.label?.trim()) return link.label.trim()
  try {
    return new URL(link.url).hostname.replace(/^www\./, '')
  } catch {
    return link.url
  }
}
