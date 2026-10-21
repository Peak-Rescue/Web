'use client'

import { Fragment, useRef, useState } from 'react'
import TrashIcon from '@/components/TrashIcon'
import {
  contactFilingShelves, fileContactToPlace, placeContactsFor, type ContactShelf,
} from '@/app/admin/courses/resource-actions'

// Who to ring about where the course is — the ranger district, the landowner,
// whoever holds the gate code.
//
// Deliberately not the course's points of contact. Those are the client: who
// booked it, who is invoiced, who hears about the people coming. A landowner
// in that list is a landowner a quote could be addressed to, which is why
// these are a separate list rather than a few more rows on that one.
//
// Copied from the venue rather than read live, because the person a given
// course actually deals with is often a name for that week — and editing that
// must not rewrite the venue for every other course that goes there.

export type PlaceContact = { name: string; phone?: string; email?: string }

// Where a row came from, held only on this screen: one picked off the
// venue's list is already filed, and one typed here is what "Save to library"
// is for. Stripped before the form posts.
type Row = PlaceContact & { filed?: string }

const input =
  'w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-sm focus:outline-none focus:border-zinc-500'

export default function CoursePlaceContacts({
  initial,
  instanceId,
}: {
  initial: PlaceContact[]
  instanceId: string
}) {
  const [rows, setRows] = useState<Row[]>(initial)
  const [filing, setFiling] = useState<number | null>(null)
  // The filing card for one row. The row is a course's shorthand — a name and
  // a number — and the venue's list is read by people who were not there, so
  // filing asks the two things the shorthand leaves out: which place they
  // belong to, and what they are for.
  const [card, setCard] = useState<{
    i: number
    shelves: { shelf: ContactShelf; label: string }[]
    shelf: ContactShelf
    name: string
    role: string
    phone: string
    email: string
    note: string
  } | null>(null)
  const [fileError, setFileError] = useState<string | null>(null)
  const [offered, setOffered] = useState<{ from: string; name: string; phones: string[]; emails: string[] }[] | null>(null)
  const [looking, setLooking] = useState(false)
  const hidden = useRef<HTMLInputElement>(null)

  // The form posts one field; the rows are the editable face of it.
  const write = (next: Row[]) => {
    setRows(next)
    if (hidden.current) {
      hidden.current.value = JSON.stringify(
        next.filter((r) => r.name.trim()).map(({ filed: _, ...r }) => r)
      )
      // A row added or removed is no keystroke, so tell the auto-save.
      hidden.current.dispatchEvent(new Event('input', { bubbles: true }))
    }
  }

  return (
    <div>
      <input
        ref={hidden}
        type="hidden"
        name="place_contacts"
        defaultValue={JSON.stringify(initial.filter((r) => r.name.trim()))}
      />
      <label className="block text-xs text-zinc-400 mb-1">
        Local contacts — ranger district, landowner, gate code
      </label>

      <div className="space-y-1.5">
        {rows.map((c, i) => (
          <Fragment key={i}>
          <div className="grid grid-cols-[1fr_1fr_auto_1.25rem] gap-2 items-center">
            <input
              className={input}
              value={c.name}
              placeholder="Who"
              onChange={(e) => write(rows.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))}
            />
            <input
              className={input}
              value={c.phone || c.email || ''}
              placeholder="Phone or email"
              onChange={(e) => {
                const v = e.target.value
                const isEmail = v.includes('@')
                write(rows.map((x, j) => (j === i ? { ...x, phone: isEmail ? '' : v, email: isEmail ? v : '' } : x)))
              }}
            />
            {c.filed ? (
              <span className="text-xs text-zinc-600" title={`On file with ${c.filed}`}>On file</span>
            ) : (
              <button
                type="button"
                disabled={!c.name.trim() || filing !== null || card !== null}
                onClick={async () => {
                  setFiling(i)
                  setFileError(null)
                  try {
                    const shelves = await contactFilingShelves(instanceId)
                    if (!shelves.length) {
                      setFileError('Say where the course is first, so there is a place to file them with.')
                      return
                    }
                    setCard({
                      i,
                      shelves,
                      shelf: shelves[0].shelf,
                      name: c.name.trim(),
                      role: '',
                      phone: c.phone ?? '',
                      email: c.email ?? '',
                      note: '',
                    })
                  } finally {
                    setFiling(null)
                  }
                }}
                className="text-xs text-zinc-500 hover:text-white transition-colors disabled:opacity-40 disabled:hover:text-zinc-500"
              >
                {filing === i ? 'Looking…' : 'Save to library'}
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                // The card is keyed by position, and this shifts every row under it.
                setCard(null)
                write(rows.filter((_, j) => j !== i))
              }}
              aria-label={`Remove ${c.name || 'contact'}`}
              className="text-xs text-zinc-600 hover:text-red-400 transition-colors"
            >
              <TrashIcon />
            </button>
          </div>
          {card?.i === i && (
            <div className="rounded border border-zinc-800 bg-zinc-900/60 p-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
              <label className="block">
                <span className="block text-[11px] text-zinc-500 mb-1">File with</span>
                <select
                  className={input}
                  value={card.shelf}
                  onChange={(e) => setCard({ ...card, shelf: e.target.value as ContactShelf })}
                >
                  {card.shelves.map((o) => (
                    <option key={o.shelf} value={o.shelf}>{o.label}</option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="block text-[11px] text-zinc-500 mb-1">Role</span>
                <input
                  className={input}
                  value={card.role}
                  placeholder="Ranger district, landowner…"
                  onChange={(e) => setCard({ ...card, role: e.target.value })}
                />
              </label>
              <label className="block">
                <span className="block text-[11px] text-zinc-500 mb-1">Name</span>
                <input className={input} value={card.name} onChange={(e) => setCard({ ...card, name: e.target.value })} />
              </label>
              <label className="block">
                <span className="block text-[11px] text-zinc-500 mb-1">Phone</span>
                <input className={input} type="tel" value={card.phone} onChange={(e) => setCard({ ...card, phone: e.target.value })} />
              </label>
              <label className="block">
                <span className="block text-[11px] text-zinc-500 mb-1">Email</span>
                <input className={input} type="email" value={card.email} onChange={(e) => setCard({ ...card, email: e.target.value })} />
              </label>
              <label className="block">
                <span className="block text-[11px] text-zinc-500 mb-1">Note</span>
                <input
                  className={input}
                  value={card.note}
                  placeholder="Gate code, best hours…"
                  onChange={(e) => setCard({ ...card, note: e.target.value })}
                />
              </label>
              <div className="sm:col-span-2 flex items-center gap-3">
                <button
                  type="button"
                  disabled={!card.name.trim() || filing !== null}
                  onClick={async () => {
                    setFiling(i)
                    setFileError(null)
                    try {
                      const res = await fileContactToPlace(instanceId, card.shelf, {
                        name: card.name,
                        role: card.role || undefined,
                        phone: card.phone || undefined,
                        email: card.email || undefined,
                        note: card.note || undefined,
                      })
                      if ('error' in res) setFileError(res.error)
                      else {
                        setRows((now) => now.map((x, j) => (j === i ? { ...x, filed: res.filedWith } : x)))
                        setCard(null)
                      }
                    } finally {
                      setFiling(null)
                    }
                  }}
                  className="px-3 py-1 bg-pr-red hover:bg-pr-red-dark text-white rounded text-xs font-medium transition-colors disabled:opacity-40"
                >
                  {filing === i ? 'Filing…' : 'File'}
                </button>
                <button
                  type="button"
                  onClick={() => setCard(null)}
                  className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
          </Fragment>
        ))}

        {fileError && <p className="text-xs text-red-400">{fileError}</p>}

        {/* One door. The venue's saved contacts are offered only when there
            are some this course does not have yet; otherwise the click is
            just a blank row, which is what it was asked for. */}
        {offered === null ? (
          <button
            type="button"
            disabled={looking}
            onClick={async () => {
              setLooking(true)
              try {
                const saved = await placeContactsFor(instanceId)
                const fresh = saved.filter(
                  (c) => !rows.some((r) => r.name.trim().toLowerCase() === c.name.toLowerCase())
                )
                if (fresh.length) setOffered(fresh)
                else write([...rows, { name: '' }])
              } finally {
                setLooking(false)
              }
            }}
            className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            {looking ? 'Looking…' : '+ Add contact'}
          </button>
        ) : (
          <div className="rounded border border-zinc-800 bg-zinc-900/60 p-2 space-y-1">
            {offered.map((c, i) => (
              <button
                key={i}
                type="button"
                onClick={() => {
                  write([...rows, { name: c.name, phone: c.phones[0], email: c.emails[0], filed: c.from }])
                  setOffered(null)
                }}
                className="w-full text-left text-xs px-1.5 py-1 rounded hover:bg-zinc-800/70 transition-colors"
              >
                <span className="text-zinc-200">{c.name}</span>
                <span className="text-zinc-600">
                  {' · '}{[...c.phones, ...c.emails].join(', ') || 'no number'}{' · from '}{c.from}
                </span>
              </button>
            ))}
            <div className="flex items-center gap-3 px-1.5 pt-1">
              <button
                type="button"
                onClick={() => {
                  write([...rows, { name: '' }])
                  setOffered(null)
                }}
                className="text-xs text-zinc-400 hover:text-white transition-colors"
              >
                + Someone else
              </button>
              <button
                type="button"
                onClick={() => setOffered(null)}
                className="text-xs text-zinc-600 hover:text-zinc-300 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
