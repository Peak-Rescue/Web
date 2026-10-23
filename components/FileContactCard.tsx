'use client'

import { useState } from 'react'
import ContactFields from '@/components/ContactFields'
import { contactFilingShelves, fileContactToPlace, type ContactShelf } from '@/app/admin/courses/resource-actions'

// Keeping a person, from wherever they were typed.
//
// A course's points of contact are the client's people and the local
// contacts are the place's, and both were typed onto one course and left
// there: the next course for the same client started from a blank list and
// somebody retyped a number off an old quote. Both lists ask the same thing
// now, with the same card, and the only difference is which answer leads —
// the client for a POC, the venue for a local contact.

export type ContactDraft = { name: string; role?: string; phone?: string; email?: string; note?: string }

export default function FileContactCard({
  instanceId,
  contact,
  onFiled,
  rolePlaceholder = 'Booking, safety, billing…',
  keepOnCourse = false,
  open: openProp,
  onOpenChange,
}: {
  instanceId: string
  contact: ContactDraft
  onFiled: (filedWith: string) => void
  rolePlaceholder?: string
  /** The course's own local list, which is otherwise only written when the
      details form is saved. */
  keepOnCourse?: boolean
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
  // Any of them, not one. The sergeant who books the course is the client's
  // person and the ranger who holds the gate code is the venue's, but plenty
  // of people are both — the resort's patrol director is the client and the
  // place — and a single choice made somebody pick which half to lose.
  const [card, setCard] = useState<Required<ContactDraft> & { shelves: ContactShelf[] } | null>(null)

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
        shelves: [options[0].shelf],
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

  return (
    <div className="w-full basis-full mt-2 rounded border border-zinc-800 bg-zinc-900/60 p-3 space-y-2">
      {/* The same panel the client page and the places page use, so a person
          filed from a course is filed by the form that files them anywhere.
          Its homes here are the course's own three — client, venue, state —
          under their shelf names, because those are resolved from the course
          on the server and never taken from the browser. Client leads where
          there is one: a point of contact is the client's person, and filing
          them under the canyon they asked about files them under the wrong
          noun. */}
      <ContactFields
        value={card}
        onChange={(v) => setCard({ ...card, ...v })}
        homes={shelves.map((o) => ({ key: o.shelf, label: o.label }))}
        chosen={card.shelves}
        onChosenChange={(keys) => setCard({ ...card, shelves: keys as ContactShelf[] })}
        rolePlaceholder={rolePlaceholder}
      />
      <div className="flex items-center gap-3">
        <button
          type="button"
          disabled={!card.name.trim() || card.shelves.length === 0 || busy}
          onClick={async () => {
            setBusy(true)
            setError(null)
            try {
              // One at a time, so a client that takes them and a venue that
              // refuses report separately rather than the pair failing.
              const filedWith: string[] = []
              for (const shelf of card.shelves) {
                const res = await fileContactToPlace(
                  instanceId,
                  shelf,
                  {
                    name: card.name,
                    role: card.role || undefined,
                    phone: card.phone || undefined,
                    email: card.email || undefined,
                    note: card.note || undefined,
                  },
                  keepOnCourse
                )
                if ('error' in res) { setError(res.error); return }
                filedWith.push(res.filedWith)
              }
              onFiled(filedWith.join(' and '))
              setOpen(false)
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
