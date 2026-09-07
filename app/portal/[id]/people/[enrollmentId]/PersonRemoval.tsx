'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { errorFrom, type ActionRefusal } from '@/lib/action-result'
import { removeFromCourse, deleteUserEntirely } from '../person-actions'

// The two ways somebody leaves, kept apart.
//
// Taking a student off a course is routine — a no-show, a transfer, a double
// enrolment — but it is not free to undo: re-enrolling them is easy, and
// reattaching the waiver that lost its seat is a hand job through the unmatched
// queue. So it asks once, inline, and the button that confirms is the one that
// was already under the cursor.
//
// Deleting the account is neither routine nor undoable, so it asks for the
// person's name to be typed. A confirm() dialog is dismissed by reflex; typing
// "Sarah Whitmore" is not something anyone does by accident. Two different
// weights of act, two different sized gates.

export default function PersonRemoval({
  instanceId,
  enrollmentId,
  name,
  courseName,
}: {
  instanceId: string
  enrollmentId: string
  name: string
  courseName: string
}) {
  const router = useRouter()
  const [busy, setBusy] = useState<null | 'course' | 'account'>(null)
  const [confirming, setConfirming] = useState(false)
  const [confirmingCourse, setConfirmingCourse] = useState(false)
  const [typed, setTyped] = useState('')
  const [problem, setProblem] = useState<ActionRefusal | null>(null)

  const matches = typed.trim().toLowerCase() === name.trim().toLowerCase()

  async function run(which: 'course' | 'account') {
    if (busy) return
    setBusy(which)
    setProblem(null)
    try {
      const result =
        which === 'course'
          ? await removeFromCourse(instanceId, enrollmentId)
          : await deleteUserEntirely(instanceId, enrollmentId)
      if (result?.error) {
        setProblem(result)
        return
      }
      router.push(`/portal/${instanceId}#roster`)
      router.refresh()
    } catch (e) {
      setProblem({ error: errorFrom(e) })
    } finally {
      setBusy(null)
    }
  }

  return (
    <section className="mt-10 rounded-lg border border-zinc-800 bg-zinc-900/50">
      <div className="px-4 py-3 border-b border-zinc-800">
        <h2 className="text-sm font-semibold text-zinc-300">Removing {name}</h2>
      </div>

      <div className="px-4 py-3 flex items-baseline gap-4 flex-wrap">
        <div className="min-w-0">
          <p className="text-sm text-zinc-200">Take them off {courseName}</p>
          <p className="text-xs text-zinc-500 mt-0.5">
            Their account, their other courses and every waiver they have signed stay as they are.
          </p>
        </div>
        {confirmingCourse ? (
          <div className="ml-auto shrink-0 flex items-center gap-2">
            <span className="text-xs text-zinc-400">Take them off?</span>
            <button
              onClick={() => run('course')}
              disabled={busy !== null}
              className="px-3 py-1.5 rounded text-xs font-medium bg-pr-red hover:bg-pr-red-dark text-white transition-colors disabled:opacity-50"
            >
              {busy === 'course' ? 'Removing…' : 'Remove'}
            </button>
            <button
              onClick={() => setConfirmingCourse(false)}
              disabled={busy !== null}
              className="px-2 py-1.5 text-xs text-zinc-400 hover:text-zinc-200 transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            onClick={() => { setConfirmingCourse(true); setProblem(null) }}
            disabled={busy !== null}
            className="ml-auto shrink-0 px-3 py-1.5 rounded text-xs font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-200 transition-colors disabled:opacity-50"
          >
            Remove from this course
          </button>
        )}
      </div>

      <div className="px-4 py-3 border-t border-zinc-800">
        <div className="flex items-baseline gap-4 flex-wrap">
          <div className="min-w-0">
            <p className="text-sm text-pr-red-light">Delete their account</p>
            <p className="text-xs text-zinc-500 mt-0.5">
              Erases them from the system: their sign-in, their profile and every course they are on.
              Waivers they have signed are kept, unattached — a signed waiver is a record of the day,
              not of the account. This cannot be undone.
            </p>
          </div>
          {!confirming && (
            <button
              onClick={() => setConfirming(true)}
              disabled={busy !== null}
              className="ml-auto shrink-0 px-3 py-1.5 rounded text-xs font-medium border border-pr-red/60 text-pr-red-light hover:bg-pr-red/10 transition-colors disabled:opacity-50"
            >
              Delete account
            </button>
          )}
        </div>

        {confirming && (
          <div className="mt-3 rounded border border-pr-red/50 bg-pr-red/5 px-3 py-3">
            <label className="block text-xs text-zinc-400 mb-1.5">
              Type <span className="text-zinc-200 font-medium">{name}</span> to confirm.
            </label>
            <div className="flex gap-2 flex-wrap">
              <input
                autoFocus
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                className="flex-1 min-w-48 bg-zinc-800 border border-zinc-700 rounded px-3 py-1.5 text-sm focus:outline-none focus:border-zinc-500"
                placeholder={name}
              />
              <button
                onClick={() => run('account')}
                disabled={!matches || busy !== null}
                className="px-3 py-1.5 rounded text-xs font-medium bg-pr-red hover:bg-pr-red-dark text-white transition-colors disabled:opacity-40 disabled:hover:bg-pr-red"
              >
                {busy === 'account' ? 'Deleting…' : 'Delete permanently'}
              </button>
              <button
                onClick={() => { setConfirming(false); setTyped(''); setProblem(null) }}
                disabled={busy !== null}
                className="px-3 py-1.5 rounded text-xs text-zinc-400 hover:text-zinc-200 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {problem && (
          <p className="mt-3 text-xs text-amber-300">
            {problem.error}
            {problem.link && (
              <>
                {' '}
                <Link href={problem.link.href} className="underline hover:text-amber-100">
                  {problem.link.label}
                </Link>
              </>
            )}
          </p>
        )}
      </div>
    </section>
  )
}
