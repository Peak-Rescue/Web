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

const STUDENTS = 'bg-teal-900/50 text-teal-300'
const INSTRUCTORS = 'bg-amber-950/60 text-amber-400'

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
