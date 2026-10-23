'use client'

import { Fragment, useEffect, useRef, useState } from 'react'
import TrashIcon from '@/components/TrashIcon'
import FileContactCard from '@/components/FileContactCard'
import { placeContactsFor, setCoursePlaceContacts } from '@/app/admin/courses/resource-actions'

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
  const [filingRow, setFilingRow] = useState<number | null>(null)
  const [offered, setOffered] = useState<{ from: string; name: string; phones: string[]; emails: string[] }[] | null>(null)
  const [looking, setLooking] = useState(false)
  const [failed, setFailed] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // This list writes itself, and is no longer a hidden field inside the
  // details form. That form auto-saves, so it posted whatever list the
  // browser was holding over the row: a contact added by the import or by
  // the filing card was wiped by the next keystroke anywhere else on the
  // form, which looked exactly like the import not working.
  const save = async (next: Row[]) => {
    try {
      await setCoursePlaceContacts(
        instanceId,
        next.filter((r) => r.name.trim()).map(({ filed: _f, ...r }) => r)
      )
      setFailed(null)
    } catch {
      // Never silent. Awaited with nothing watching it, a refused write left
      // the row on screen and nothing in the database.
      setFailed('Those didn’t save — try again')
    }
  }

  /** A row added, picked or removed: written at once, there is nothing more
      coming. */
  const write = (next: Row[]) => {
    setRows(next)
    if (timer.current) clearTimeout(timer.current)
    void save(next)
  }

  /** A name or number being typed: written once they stop, so a phone number
      is one write and not eleven racing ones. */
  const type = (next: Row[]) => {
    setRows(next)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => void save(next), 700)
  }

  // Closing the editor mid-word must not lose the word.
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])

  return (
    <div>
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
              onChange={(e) => type(rows.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))}
            />
            <input
              className={input}
              value={c.phone || c.email || ''}
              placeholder="Phone or email"
              onChange={(e) => {
                const v = e.target.value
                const isEmail = v.includes('@')
                type(rows.map((x, j) => (j === i ? { ...x, phone: isEmail ? '' : v, email: isEmail ? v : '' } : x)))
              }}
            />
            {c.filed ? (
              // Not an end state. The same person is often the client's and
              // the venue's, and filing again adds them to the other list
              // rather than moving them.
              <button
                type="button"
                onClick={() => setRows((now) => now.map((x, k) => (k === i ? { ...x, filed: undefined } : x)))}
                title={`On file with ${c.filed} — file them somewhere else too`}
                className="text-xs text-zinc-600 hover:text-zinc-300 transition-colors"
              >
                On file · change
              </button>
            ) : (
              <button
                type="button"
                disabled={!c.name.trim()}
                onClick={() => setFilingRow(filingRow === i ? null : i)}
                className="text-xs text-zinc-500 hover:text-white transition-colors disabled:opacity-40 disabled:hover:text-zinc-500"
              >
                {filingRow === i ? 'Close' : 'Save to library'}
              </button>
            )}
            <button
              type="button"
              onClick={() => write(rows.filter((_, j) => j !== i))}
              aria-label={`Remove ${c.name || 'contact'}`}
              className="text-xs text-zinc-600 hover:text-red-400 transition-colors"
            >
              <TrashIcon />
            </button>
          </div>
          {/* Under the row, not in a column of it: four fields and a set of
              checkboxes squeezed beside a phone number is the shape it was. */}
          {filingRow === i && (
            <FileContactCard
              instanceId={instanceId}
              open
              keepOnCourse
              onOpenChange={(v) => setFilingRow(v ? i : null)}
              contact={{ name: c.name, phone: c.phone, email: c.email }}
              rolePlaceholder="Ranger district, landowner…"
              onFiled={(where) => {
                setRows((now) => now.map((x, k) => (k === i ? { ...x, filed: where } : x)))
                setFilingRow(null)
              }}
            />
          )}
          </Fragment>
        ))}


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
                  // Written by `write`, now, rather than waiting for a save
                  // of the form around it. Left in the browser, the import
                  // went with the editor when it closed.
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

        {failed && <p className="text-xs text-pr-red">{failed}</p>}
      </div>
    </div>
  )
}
