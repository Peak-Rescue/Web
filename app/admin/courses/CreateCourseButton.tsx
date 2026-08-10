'use client'

import { useFormStatus } from 'react-dom'

// Creating a course inserts a row, mirrors an event onto Google Calendar and
// then redirects, which is long enough that a plain submit button looks like it
// did nothing. Two identical MARSOC courses three seconds apart came from
// exactly that: clicked, no feedback, clicked again.
//
// The button has to live in its own client component because useFormStatus only
// reports on a form it sits inside, and the page around it is a server
// component.
export default function CreateCourseButton() {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className="px-5 py-2 bg-pr-red hover:bg-pr-red-dark text-white rounded font-medium text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {pending ? 'Creating…' : 'Create course →'}
    </button>
  )
}
