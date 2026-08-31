// One-off links attached to a course.
//
// The distinction that matters: library items are material we expect to use
// again, filed with disciplines and topics so it can be found. These are links
// that mean something for one delivery — this course's photo album, this
// client's paperwork, this permit portal — and nothing for the next one.

export const LINK_PURPOSES = ['photos', 'resource', 'form', 'other'] as const
export type LinkPurpose = (typeof LINK_PURPOSES)[number]

// The library lands on Published now, so a link here would mostly be right on
// its own. It still asks for everything: a link followed to check on a
// document should find it whatever state it is in, and an archived one going
// missing reads as "it was deleted".
export const LIBRARY_HREF = '/admin/library?status=all'

export const PURPOSE_META: Record<
  LinkPurpose,
  { label: string; hint: string; verb: string }
> = {
  photos: {
    label: 'Photos',
    hint: 'A shared album for this course',
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

// Only photo albums are offered on a course now: a one-off document belongs in
// Files or the course notes, and anything we'd use twice belongs in the
// library, where the curriculum can reach it. The other purposes stay in the
// type so the portal can still render any row an older course kept.

export type CourseLink = {
  id: string
  url: string
  label: string | null
  purpose: LinkPurpose
  audience: 'internal' | 'shared'
  // Set when the portal created and manages this album as a Drive folder,
  // rather than someone pasting a link to an album of their own. It is what
  // separates a row you can only follow from one you can add photos to.
  drive_folder_id?: string | null
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
