'use client'

import { useRef, useState } from 'react'
import TrashIcon from '@/components/TrashIcon'
import { placeContactsFor } from '@/app/admin/courses/resource-actions'

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

const input =
  'w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-sm focus:outline-none focus:border-zinc-500'

export default function CoursePlaceContacts({
  initial,
  instanceId,
}: {
  initial: PlaceContact[]
  instanceId: string
}) {
  const [rows, setRows] = useState<PlaceContact[]>(initial)
  const [offered, setOffered] = useState<{ from: string; name: string; phones: string[]; emails: string[] }[] | null>(null)
  const [looking, setLooking] = useState(false)
  const hidden = useRef<HTMLInputElement>(null)

  // The form posts one field; the rows are the editable face of it.
  const write = (next: PlaceContact[]) => {
    setRows(next)
    if (hidden.current) {
      hidden.current.value = JSON.stringify(next.filter((r) => r.name.trim()))
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
          <div key={i} className="grid grid-cols-[1fr_1fr_1.25rem] gap-2 items-center">
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
            <button
              type="button"
              onClick={() => write(rows.filter((_, j) => j !== i))}
              aria-label={`Remove ${c.name || 'contact'}`}
              className="text-xs text-zinc-600 hover:text-red-400 transition-colors"
            >
              <TrashIcon />
            </button>
          </div>
        ))}

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => write([...rows, { name: '' }])}
            className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            + Add contact
          </button>
          {offered === null && (
            <button
              type="button"
              disabled={looking}
              onClick={async () => {
                setLooking(true)
                try { setOffered(await placeContactsFor(instanceId)) } finally { setLooking(false) }
              }}
              className="text-xs text-zinc-500 hover:text-white transition-colors"
            >
              {looking ? 'Looking…' : '+ From where this course is'}
            </button>
          )}
        </div>

        {offered !== null && (
          offered.length === 0 ? (
            <p className="text-xs text-zinc-600">
              Nowhere this course is has a contact on it yet. They are added on the venue.
            </p>
          ) : (
            <div className="rounded border border-zinc-800 bg-zinc-900/60 p-2 space-y-1">
              {offered.map((c, i) => {
                const already = rows.some((r) => r.name.trim().toLowerCase() === c.name.toLowerCase())
                return (
                  <button
                    key={i}
                    type="button"
                    disabled={already}
                    onClick={() =>
                      write([...rows, { name: c.name, phone: c.phones[0], email: c.emails[0] }])
                    }
                    className="w-full text-left text-xs px-1.5 py-1 rounded hover:bg-zinc-800/70 transition-colors disabled:opacity-40 disabled:hover:bg-transparent"
                  >
                    <span className="text-zinc-200">{c.name}</span>
                    <span className="text-zinc-600">
                      {' · '}{[...c.phones, ...c.emails].join(', ') || 'no number'}{' · from '}{c.from}
                      {already && ' · already here'}
                    </span>
                  </button>
                )
              })}
            </div>
          )
        )}
      </div>
    </div>
  )
}
