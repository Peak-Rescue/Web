'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { addGuestInstructor } from './staffing-actions'

// Staff a one-off guest who isn't in the instructor roster: name + email
// creates their instructor record, assigns them here, and emails a portal
// invite so they can set up their login.
export default function GuestInstructorButton({
  instanceId,
  hasLead,
}: {
  instanceId: string
  hasLead: boolean
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<'lead' | 'assist'>(hasLead ? 'assist' : 'lead')
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const canSubmit = firstName.trim() && lastName.trim() && email.trim()

  function submit() {
    if (!canSubmit) return
    setError(null)
    startTransition(async () => {
      try {
        const res = await addGuestInstructor(instanceId, {
          firstName,
          lastName,
          email,
          role,
        })
        setDone(
          res.existed
            ? `${res.name} was already in the roster — assigned and sent a sign-in link.`
            : `${res.name} added and invited by email.`
        )
        setOpen(false)
        setFirstName('')
        setLastName('')
        setEmail('')
        router.refresh()
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Something went wrong')
      }
    })
  }

  if (!open) {
    return (
      <div className="mt-3">
        <button
          onClick={() => {
            setDone(null)
            setOpen(true)
          }}
          className="inline-flex items-center text-xs px-2.5 py-1.5 rounded border border-zinc-700 text-zinc-300 hover:text-white hover:border-zinc-500 transition-colors"
        >
          + Guest instructor (not in the roster yet)
        </button>
        {done && <p className="mt-1 text-xs text-teal-400">{done}</p>}
      </div>
    )
  }

  return (
    <div className="mt-3 p-4 bg-zinc-900 border border-dashed border-zinc-700 rounded-lg">
      <p className="text-xs text-zinc-500 mb-3">
        Adds them to the instructor roster, staffs them on this course, and emails an invite to create their portal login.
      </p>
      <div className="flex items-end gap-2 flex-wrap">
        <div>
          <label className="block text-xs text-zinc-500 mb-1">First name</label>
          <input
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            className="w-32 bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-zinc-500"
          />
        </div>
        <div>
          <label className="block text-xs text-zinc-500 mb-1">Last name</label>
          <input
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            className="w-32 bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-zinc-500"
          />
        </div>
        <div>
          <label className="block text-xs text-zinc-500 mb-1">Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-52 bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-zinc-500"
          />
        </div>
        <div>
          <label className="block text-xs text-zinc-500 mb-1">Role</label>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as 'lead' | 'assist')}
            className="bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-zinc-500"
          >
            <option value="lead">Lead</option>
            <option value="assist">Assist</option>
          </select>
        </div>
        <button
          onClick={submit}
          disabled={isPending || !canSubmit}
          className="px-4 py-2 bg-pr-red hover:bg-pr-red-dark text-white rounded text-sm font-medium transition-colors disabled:opacity-50"
        >
          {isPending ? 'Adding…' : 'Add & invite'}
        </button>
        <button
          onClick={() => setOpen(false)}
          disabled={isPending}
          className="px-3 py-2 text-zinc-400 hover:text-zinc-200 text-sm"
        >
          Cancel
        </button>
      </div>
      {error && <p className="mt-2 text-xs text-pr-red-light">{error}</p>}
    </div>
  )
}
