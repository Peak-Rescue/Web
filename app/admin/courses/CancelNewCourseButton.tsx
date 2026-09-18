'use client'

import { useRouter, useSearchParams } from 'next/navigation'

// A way out of the new-course form.
//
// It is a <details> that opens either from its own summary or from the + on
// the portal calendar, and once open the only way to shut it was to find the
// summary again and click it — which on a filled-in form is above the fold
// and reads as a heading rather than a control. So the form says how to leave
// it, next to the button that commits.
//
// Closing is all it does: the fields keep what was typed, because a mis-click
// on "cancel" that emptied the form would be the expensive mistake here, and
// nothing has been saved either way. The ?new= that the calendar's + adds is
// dropped at the same time, or the next render would open the form again
// underneath the click.
export default function CancelNewCourseButton() {
  const router = useRouter()
  const params = useSearchParams()

  return (
    <button
      type="button"
      onClick={(e) => {
        e.currentTarget.closest('details')?.removeAttribute('open')
        if (params.get('new') === null) return
        const rest = new URLSearchParams(params)
        rest.delete('new')
        const query = rest.toString()
        router.replace(query ? `/admin/courses?${query}` : '/admin/courses', { scroll: false })
      }}
      className="px-4 py-2 text-sm text-zinc-400 hover:text-zinc-200 transition-colors"
    >
      Cancel
    </button>
  )
}
