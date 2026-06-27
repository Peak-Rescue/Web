'use client'

import { useState, useRef, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { adminCreateInstructor } from './[id]/actions'

export default function AddInstructorButton() {
  const [open, setOpen] = useState(false)
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const firstNameRef = useRef<HTMLInputElement>(null)
  const router = useRouter()

  function openModal() {
    setFirstName('')
    setLastName('')
    setEmail('')
    setError(null)
    setOpen(true)
    setTimeout(() => firstNameRef.current?.focus(), 50)
  }

  function closeModal() {
    if (isPending) return
    setOpen(false)
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!firstName.trim()) { setError('First name is required'); return }
    if (!lastName.trim()) { setError('Last name is required'); return }
    setError(null)
    startTransition(async () => {
      try {
        const { id } = await adminCreateInstructor(firstName.trim(), lastName.trim(), email.trim())
        setOpen(false)
        router.push(`/admin/instructors/${id}`)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Something went wrong')
      }
    })
  }

  const canSubmit = firstName.trim().length > 0 && lastName.trim().length > 0

  return (
    <>
      <button
        onClick={openModal}
        className="flex items-center gap-2 px-4 py-2 rounded font-medium text-sm bg-pr-red hover:bg-pr-red-dark text-white transition-colors"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
        </svg>
        Add instructor
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70"
          onClick={closeModal}
        >
          <div
            className="bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl w-full max-w-md mx-4 p-6"
            onClick={e => e.stopPropagation()}
          >
            <h2 className="text-lg font-semibold mb-1">Add instructor</h2>
            <p className="text-sm text-zinc-400 mb-5">Creates a new profile. You can fill in details and send an invite from there.</p>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="block text-xs font-medium text-zinc-300 mb-1">First name <span className="text-pr-red-light">*</span></label>
                  <input
                    ref={firstNameRef}
                    type="text"
                    value={firstName}
                    onChange={e => setFirstName(e.target.value)}
                    placeholder="Jane"
                    className="w-full px-3 py-2 rounded bg-zinc-800 border border-zinc-700 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-zinc-500"
                    required
                  />
                </div>
                <div className="flex-1">
                  <label className="block text-xs font-medium text-zinc-300 mb-1">Last name <span className="text-pr-red-light">*</span></label>
                  <input
                    type="text"
                    value={lastName}
                    onChange={e => setLastName(e.target.value)}
                    placeholder="Smith"
                    className="w-full px-3 py-2 rounded bg-zinc-800 border border-zinc-700 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-zinc-500"
                    required
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="jane@example.com"
                  className="w-full px-3 py-2 rounded bg-zinc-800 border border-zinc-700 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-zinc-500"
                />
                <p className="text-xs text-zinc-500 mt-1">Used to send a portal invite later.</p>
              </div>

              {error && <p className="text-sm text-red-400">{error}</p>}

              <div className="flex justify-end gap-3 pt-1">
                <button
                  type="button"
                  onClick={closeModal}
                  disabled={isPending}
                  className="px-4 py-2 rounded text-sm font-medium text-zinc-300 hover:text-white bg-zinc-800 hover:bg-zinc-700 transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isPending || !canSubmit}
                  className="px-4 py-2 rounded text-sm font-medium bg-pr-red hover:bg-pr-red-dark text-white transition-colors disabled:opacity-50"
                >
                  {isPending ? 'Creating…' : 'Create profile'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
