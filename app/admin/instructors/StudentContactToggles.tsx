'use client'

import { useState } from 'react'
import InfoHint from '@/components/InfoHint'
import { adminSetStudentContact } from './[id]/actions'

// The same two switches an instructor has on /instructor, here as well.
//
// Not because an admin should be deciding this for somebody — it is their
// number and their inbox — but because the people who most need a detail
// taken down are the least likely to be logged in when they ask for it. The
// same reasoning the calendar invites are set both places under.
export default function StudentContactToggles({
  instructorId,
  showEmail,
  showPhone,
  hasWorkEmail,
  hasPhone,
}: {
  instructorId: string
  showEmail: boolean
  showPhone: boolean
  /** A personal address is never shown, so there is nothing here to switch. */
  hasWorkEmail: boolean
  hasPhone: boolean
}) {
  const [email, setEmail] = useState(showEmail)
  const [phone, setPhone] = useState(showPhone)
  const [saving, setSaving] = useState(false)

  async function set(field: 'email' | 'phone', next: boolean) {
    if (saving) return
    setSaving(true)
    try {
      await adminSetStudentContact(instructorId, field === 'email' ? { showEmail: next } : { showPhone: next })
      if (field === 'email') setEmail(next)
      else setPhone(next)
    } finally {
      setSaving(false)
    }
  }

  const row = (
    label: string,
    hint: string,
    on: boolean,
    live: boolean,
    onClick: () => void
  ) => (
    <div className="flex items-center justify-between px-4 py-3 bg-zinc-900 border border-zinc-800 rounded-lg">
      <div className="flex items-center gap-1.5">
        <p className={`text-sm font-medium ${live ? '' : 'text-zinc-500'}`}>{label}</p>
        <InfoHint text={hint} />
      </div>
      <button
        onClick={onClick}
        disabled={saving || !live}
        className={`px-3 py-1.5 rounded text-xs font-medium transition-colors disabled:opacity-50 ${
          live && on ? 'bg-teal-700 hover:bg-teal-600 text-white' : 'bg-zinc-700 hover:bg-zinc-600 text-zinc-300'
        }`}
      >
        {!live ? 'Nothing to show' : on ? 'Shown' : 'Hidden'}
      </button>
    </div>
  )

  return (
    <div className="space-y-2">
      {row(
        'Show their email to students',
        hasWorkEmail
          ? 'Their card on the courses they are staffed on. The crew see it either way.'
          : 'Only a peak-rescue.com address is ever shown to students, and this one is not, so there is nothing to switch.',
        email,
        hasWorkEmail,
        () => set('email', !email)
      )}
      {row(
        'Show their phone to students',
        hasPhone
          ? 'Every number we hold is a personal mobile, so this is theirs to give. Off unless they have said yes.'
          : 'There is no number on their profile, so there is nothing to show.',
        phone,
        hasPhone,
        () => set('phone', !phone)
      )}
    </div>
  )
}
