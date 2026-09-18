// A course's status, and what it looks like — in one place because three
// screens draw the same five words and the filter bar, the row badge and the
// quick-change menu all have to agree on which yellow means tentative.

export const COURSE_STATUSES = ['tentative', 'quoted', 'confirmed', 'completed', 'cancelled'] as const

export type CourseStatus = (typeof COURSE_STATUSES)[number]

export const COURSE_STATUS_STYLES: Record<string, string> = {
  tentative: 'bg-yellow-900/40 text-yellow-300 border-yellow-700',
  quoted:    'bg-blue-900/40 text-blue-300 border-blue-700',
  confirmed: 'bg-teal-900/40 text-teal-300 border-teal-700',
  completed: 'bg-zinc-700 text-zinc-300 border-zinc-600',
  cancelled: 'bg-red-900/40 text-red-300 border-red-700',
}

/** What moving a course to this status actually does, said before you do it —
    two of them send email, and one of them sends it to the whole crew. */
export const COURSE_STATUS_MEANING: Record<string, string> = {
  tentative: 'An enquiry. Nothing promised either way.',
  quoted: 'A price is with the client and we are waiting on them.',
  confirmed: 'It is happening. The crew plans around it.',
  completed: 'It has run. It leaves the upcoming list.',
  cancelled: 'It is off. Everyone assigned is emailed, and it comes off the calendar.',
}
