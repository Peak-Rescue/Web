import { type LibraryAudience } from '@/lib/library'

// Who can see this, said the same way everywhere.
//
// The app had grown three vocabularies for one idea — "Internal" and
// "Students" in the library, "Instructors" and "Students" on gear lists,
// "Instructors only" on portal sections — across two palettes, teal-versus-
// zinc in admin and amber in the portal. Same question, three answers, so
// nothing transferred from one screen to the next.
//
// The pills list who it reaches rather than naming a policy. Shared shows two,
// internal shows one, and the difference between them is a pill appearing —
// which is easier to read at a glance than the difference between the words
// "Internal" and "Students".

// Exported, because the pill is not the only place either of these appears —
// a map's audience chip, a toggle, an update's "Instructors only" — and every
// hand-rolled copy is a place the vocabulary can drift.
//
// Instructors were amber until the library's "needs sorting" badge landed
// beside one and the two read as the same kind of fact. Amber had come to
// mean attention everywhere else in the portal — unsigned waivers, missing
// MEDEVAC plans, a crew that is not the crew priced — and an audience is not
// a warning. Violet is spoken nowhere else.
export const STUDENTS = 'bg-teal-900/50 text-teal-300'
export const INSTRUCTORS = 'bg-violet-950/70 text-violet-300'

export function AudiencePills({
  audience,
  className = '',
}: {
  audience: LibraryAudience
  className?: string
}) {
  const pill = 'text-[10px] leading-none px-1.5 py-1 rounded'
  return (
    <span className={`inline-flex items-center gap-1 ${className}`}>
      {audience === 'shared' && <span className={`${pill} ${STUDENTS}`}>Students</span>}
      <span className={`${pill} ${INSTRUCTORS}`}>Instructors</span>
    </span>
  )
}

// The same thing for the one place that isn't a library audience: a gear list
// is written *for* one group rather than hidden from another, so an instructor
// list shows only the instructor pill and a student list only the student one.
export function ForPill({ audience }: { audience: 'student' | 'instructor' }) {
  return (
    <span
      className={`text-[10px] leading-none px-1.5 py-1 rounded ${
        audience === 'instructor' ? INSTRUCTORS : STUDENTS
      }`}
    >
      {audience === 'instructor' ? 'Instructors' : 'Students'}
    </span>
  )
}

// Narrowing a library search to who an item reaches. Two pills in the colours
// the rows already wear, one or neither picked: an item is either seen by
// students or kept to instructors, so "both" would be no filter and "neither"
// would be an empty list. Every library search uses this one, so the control
// reads the same wherever a search does.
export function AudienceFilter({
  value,
  onChange,
  className = '',
}: {
  value: LibraryAudience | null
  onChange: (next: LibraryAudience | null) => void
  className?: string
}) {
  return (
    <span className={`inline-flex items-center gap-1 shrink-0 ${className}`}>
      {FILTER_CHOICES.map((c) => {
        const on = value === c.audience
        return (
          <button
            key={c.audience}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(on ? null : c.audience)}
            title={filterTitle(c.audience, on)}
            className={filterPillClass(c.colour, on, value !== null)}
          >
            {c.label}
          </button>
        )
      })}
    </span>
  )
}

// The same two pills as links, for a page that filters through its address —
// the library page, which is rendered on the server and keeps every filter in
// the URL. `hrefFor` gives the address with that audience picked, or with the
// filter cleared for null.
export function AudienceFilterLinks({
  value,
  hrefFor,
  className = '',
}: {
  value: LibraryAudience | null
  hrefFor: Record<LibraryAudience | 'none', string>
  className?: string
}) {
  return (
    <span className={`inline-flex items-center gap-1 shrink-0 ${className}`}>
      {FILTER_CHOICES.map((c) => {
        const on = value === c.audience
        return (
          <a
            key={c.audience}
            href={on ? hrefFor.none : hrefFor[c.audience]}
            aria-current={on ? 'true' : undefined}
            title={filterTitle(c.audience, on)}
            className={filterPillClass(c.colour, on, value !== null)}
          >
            {c.label}
          </a>
        )
      })}
    </span>
  )
}

const FILTER_CHOICES: { audience: LibraryAudience; label: string; colour: string }[] = [
  { audience: 'shared', label: 'Students', colour: STUDENTS },
  { audience: 'internal', label: 'Instructors only', colour: INSTRUCTORS },
]

const filterTitle = (a: LibraryAudience, on: boolean) =>
  on ? 'Show everything' : `Only what ${a === 'shared' ? 'students can see' : 'is kept to instructors'}`

// Picked: ringed. Another picked: faded. Neither: both a little quiet, so the
// pair reads as a choice to make rather than two labels on the row.
const filterPillClass = (colour: string, on: boolean, anyOn: boolean) =>
  `text-[10px] leading-none px-1.5 py-1 rounded transition-opacity ${colour} ${
    on ? 'ring-1 ring-current' : anyOn ? 'opacity-40 hover:opacity-80' : 'opacity-70 hover:opacity-100'
  }`

/** Whether a row passes the audience filter. A row with no audience of its own
    is read as shared, the library's default. */
export function matchesAudience(rowAudience: string | null | undefined, filter: LibraryAudience | null): boolean {
  return !filter || (rowAudience === 'internal' ? 'internal' : 'shared') === filter
}
