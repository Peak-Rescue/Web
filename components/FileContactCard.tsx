'use client'

import { useState } from 'react'
import { contactFilingShelves, fileContactToPlace, type ContactShelf } from '@/app/admin/courses/resource-actions'

// Keeping a person, from wherever they were typed.
//
// A course's points of contact are the client's people and the local
// contacts are the place's, and both were typed onto one course and left
// there: the next course for the same client started from a blank list and
// somebody retyped a number off an old quote. Both lists ask the same thing
// now, with the same card, and the only difference is which answer leads —
// the client for a POC, the venue for a local contact.

const input =
  'w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-sm focus:outline-none focus:border-zinc-500'

export type ContactDraft = { name: string; role?: string; phone?: string; email?: string; note?: string }

export default function FileContactCard({
  instanceId,
  contact,
  onFiled,
  rolePlaceholder = 'Booking, safety, billing…',
  open: openProp,
  onOpenChange,
}: {
  instanceId: string
  contact: ContactDraft
  onFiled: (filedWith: string) => void
  rolePlaceholder?: string
  /** Controlled, where the button and the panel cannot sit together: in a
      three-column grid the panel drawn beside its own button is a form
      squeezed into one column of it. The parent puts the button in the row
      and the panel under it. */
  open?: boolean
  onOpenChange?: (open: boolean) => void
}) {
  const [openState, setOpenState] = useState(false)
  const controlled = openProp !== undefined
  const open = controlled ? openProp : openState
  const setOpen = (v: boolean) => (controlled ? onOpenChange?.(v) : setOpenState(v))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [shelves, setShelves] = useState<{ shelf: ContactShelf; label: string }[] | null>(null)
  const [card, setCard] = useState<Required<ContactDraft> & { shelf: ContactShelf } | null>(null)

  async function start() {
    setBusy(true)
    setError(null)
    try {
      const options = await contactFilingShelves(instanceId)
      if (!options.length) {
        setError('Say which client this course is for, or where it is, so there is something to file them with.')
        return
      }
      setShelves(options)
      setCard({
        shelf: options[0].shelf,
        name: contact.name.trim(),
        role: contact.role ?? '',
        phone: contact.phone ?? '',
        email: contact.email ?? '',
        note: contact.note ?? '',
      })
      setOpen(true)
    } finally {
      setBusy(false)
    }
  }

  // Controlled and asked to open: fetch the shelves once, then draw the
  // panel. There is no button here to have done it.
  if (controlled && open && !card && !busy && !error) void start()
  if (controlled && (!open || !card || !shelves)) {
    return error ? <p className="text-[11px] text-pr-red">{error}</p> : null
  }

  if (!open || !card || !shelves) {
    return (
      <>
        <button
          type="button"
          disabled={!contact.name.trim() || busy}
          onClick={start}
          className="text-xs text-zinc-500 hover:text-white transition-colors disabled:opacity-40 disabled:hover:text-zinc-500"
        >
          {busy ? 'Looking…' : 'Save to library'}
        </button>
        {error && <span className="text-[11px] text-pr-red">{error}</span>}
      </>
    )
  }

  const field = (
    label: string,
    key: 'name' | 'role' | 'phone' | 'email' | 'note',
    extra?: { type?: string; placeholder?: string }
  ) => (
    <label className="block">
      <span className="block text-[11px] text-zinc-500 mb-1">{label}</span>
      <input
        className={input}
        type={extra?.type}
        placeholder={extra?.placeholder}
        value={card[key]}
        onChange={(e) => setCard({ ...card, [key]: e.target.value })}
      />
    </label>
  )

  return (
    <div className="w-full basis-full mt-2 rounded border border-zinc-800 bg-zinc-900/60 p-3 grid grid-cols-1 sm:grid-cols-3 gap-2">
      <label className="block">
        {/* Client first where there is one: a point of contact is the
            client's person, and filing them under the canyon they asked
            about files them under the wrong noun. */}
        <span className="block text-[11px] text-zinc-500 mb-1">File with</span>
        <select
          className={input}
          value={card.shelf}
          onChange={(e) => setCard({ ...card, shelf: e.target.value as ContactShelf })}
        >
          {shelves.map((o) => (
            <option key={o.shelf} value={o.shelf}>{o.label}</option>
          ))}
        </select>
      </label>
      {field('Role', 'role', { placeholder: rolePlaceholder })}
      {field('Name', 'name')}
      {field('Phone', 'phone', { type: 'tel' })}
      {field('Email', 'email', { type: 'email' })}
      {field('Note', 'note', { placeholder: 'Best hours, gate code…' })}
      <div className="sm:col-span-2 flex items-center gap-3">
        <button
          type="button"
          disabled={!card.name.trim() || busy}
          onClick={async () => {
            setBusy(true)
            setError(null)
            try {
              const res = await fileContactToPlace(instanceId, card.shelf, {
                name: card.name,
                role: card.role || undefined,
                phone: card.phone || undefined,
                email: card.email || undefined,
                note: card.note || undefined,
              })
              if ('error' in res) setError(res.error)
              else {
                onFiled(res.filedWith)
                setOpen(false)
              }
            } finally {
              setBusy(false)
            }
          }}
          className="px-3 py-1 bg-pr-red hover:bg-pr-red-dark text-white rounded text-xs font-medium transition-colors disabled:opacity-40"
        >
          {busy ? 'Filing…' : 'File'}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          Cancel
        </button>
        {error && <span className="text-[11px] text-pr-red">{error}</span>}
      </div>
    </div>
  )
}
