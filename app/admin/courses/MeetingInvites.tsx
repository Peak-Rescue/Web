'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { setMeetingInvites } from './staffing-actions'
import TrashIcon from '@/components/TrashIcon'

/** Who a meeting is for, when it is not for everyone.
 *
 *  Built like the interest check on a course — a picker of instructors behind
 *  a button, then the list of who is on it — because it is the same gesture:
 *  choosing people off the roster for one thing on the calendar. It differs
 *  in what it does not do. Nobody is emailed and nobody answers; being on the
 *  list puts the meeting on that person's calendar and nothing else.
 */
export default function MeetingInvites({
  instanceId,
  people,
  invited,
}: {
  instanceId: string
  /** Every active instructor. */
  people: { id: string; name: string }[]
  invited: string[]
}) {
  const [showPicker, setShowPicker] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(() => new Set(invited))
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const router = useRouter()

  const nameOf = new Map(people.map((p) => [p.id, p.name]))
  const allOn = people.length > 0 && people.every((p) => selected.has(p.id))
  const someOn = !allOn && people.some((p) => selected.has(p.id))

  async function save(ids: string[]) {
    if (busy) return
    setBusy(true)
    setMessage(null)
    try {
      await setMeetingInvites(instanceId, ids)
      setSelected(new Set(ids))
      setShowPicker(false)
      router.refresh()
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Saving failed — please try again')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <button
        onClick={() => { setShowPicker((v) => !v); setSelected(new Set(invited)); setMessage(null) }}
        className="inline-flex items-center text-xs px-2.5 py-1.5 rounded border border-zinc-700 text-zinc-300 hover:text-white hover:border-zinc-500 transition-colors"
      >
        {showPicker ? 'Close' : '+ Choose who is invited'}
      </button>

      {message && <p className="mt-2 text-xs text-red-400">{message}</p>}

      {showPicker && (
        <div className="mt-3 p-4 bg-zinc-900 border border-zinc-800 rounded-lg">
          <div className="flex items-center gap-4 px-2 py-1.5 mb-1 border-b border-zinc-800 text-sm">
            <label className="flex items-center gap-2.5 cursor-pointer text-zinc-400 hover:text-zinc-200 transition-colors">
              {/* `indeterminate` has no HTML attribute, so a ref callback is
                  the only way it survives the first paint. */}
              <input
                ref={(el) => { if (el) el.indeterminate = someOn }}
                type="checkbox"
                checked={allOn}
                onChange={() => setSelected(allOn ? new Set() : new Set(people.map((p) => p.id)))}
                className="accent-red-600"
              />
              All
            </label>
          </div>
          <div className="space-y-1 max-h-64 overflow-y-auto pr-1">
            {people.map((p) => (
              <label key={p.id} className="flex items-center gap-2.5 px-2 py-1.5 rounded text-sm cursor-pointer hover:bg-zinc-800/60">
                <input
                  type="checkbox"
                  checked={selected.has(p.id)}
                  onChange={() =>
                    setSelected((prev) => {
                      const next = new Set(prev)
                      if (next.has(p.id)) next.delete(p.id)
                      else next.add(p.id)
                      return next
                    })
                  }
                  className="accent-red-600"
                />
                <span>{p.name}</span>
              </label>
            ))}
          </div>
          <button
            onClick={() => save([...selected])}
            disabled={busy}
            className="mt-3 px-4 py-2 bg-pr-red hover:bg-pr-red-dark text-white rounded text-sm font-medium transition-colors disabled:opacity-40"
          >
            {busy ? 'Saving…' : `Invite ${selected.size} ${selected.size === 1 ? 'person' : 'people'}`}
          </button>
        </div>
      )}

      {invited.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {invited.map((id) => (
            <span key={id} className="inline-flex items-center gap-2 px-3 py-1.5 bg-zinc-900 border border-zinc-800 rounded-lg text-sm">
              {nameOf.get(id) ?? 'Former instructor'}
              <button
                onClick={() => save(invited.filter((x) => x !== id))}
                disabled={busy}
                aria-label={`Remove ${nameOf.get(id) ?? 'this person'} from the invite list`}
                className="text-zinc-700 hover:text-red-400 transition-colors text-sm leading-none disabled:opacity-40"
              >
                <TrashIcon />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
