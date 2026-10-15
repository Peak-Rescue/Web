'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { addRegion } from './actions'
import { createPlaceInline } from '@/app/admin/library/actions'
import { COUNTRIES, SUBDIVISIONS } from '@/lib/regions'
import { errorFrom } from '@/lib/action-result'

// Making a level before there is anything in it.
//
// A country and a state are not rows anywhere — they are codes other things
// carry — so until something was filed under one there was no heading to file
// anything under, and the only way to reach a new state was to invent a venue
// named after it. Four states got made that way before this existed.
//
// A venue is a row, and it is made here rather than on a form at the foot of
// the page, because the state it belongs to is the heading this button is
// sitting under.
export default function AddLevel({
  level,
  country,
}: {
  level: 'country' | 'state' | 'venue'
  /** For a state, which country's list to offer; for a venue, the region it
      lands in. Empty means the venue is filed nowhere. */
  country?: string
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function run(fn: () => Promise<{ error: string } | unknown>) {
    setBusy(true)
    setError(null)
    try {
      const r = await fn()
      if (r && typeof r === 'object' && 'error' in r) { setError(String(r.error)); return }
      setOpen(false)
      router.refresh()
    } catch (e) {
      setError(errorFrom(e, 'That didn’t save'))
    } finally {
      setBusy(false)
    }
  }

  const word = level === 'country' ? 'country' : level === 'state' ? 'state' : 'venue'

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="text-[11px] text-zinc-600 hover:text-white transition-colors"
      >
        + Add a {word}
      </button>
    )
  }

  const cls = 'bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs focus:outline-none focus:border-zinc-500'
  const cancel = (
    <button onClick={() => { setOpen(false); setError(null) }} disabled={busy}
            className="text-[11px] text-zinc-600 hover:text-zinc-300 transition-colors">
      Cancel
    </button>
  )

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {level === 'venue' ? (
        <input
          autoFocus
          disabled={busy}
          placeholder="Name of the venue"
          className={`${cls} min-w-[14rem]`}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setOpen(false)
            if (e.key !== 'Enter') return
            e.preventDefault()
            const v = (e.target as HTMLInputElement).value.trim()
            if (v) run(() => createPlaceInline(v, country ?? null))
          }}
        />
      ) : (
        <select
          autoFocus
          disabled={busy}
          defaultValue=""
          className={cls}
          onChange={(e) => e.target.value && run(() => addRegion(e.target.value))}
        >
          <option value="">— pick a {word} —</option>
          {level === 'country'
            // Only the countries that are a place on their own. 'US' is not a
            // region anything can be filed under — the state is — so the
            // United States and Canada are reached by adding a state, and
            // offering them here would only be to refuse them.
            ? COUNTRIES.filter((c) => !SUBDIVISIONS[c.code]).map((c) => (
                <option key={c.code} value={c.code}>{c.name}</option>
              ))
            : (SUBDIVISIONS[country ?? ''] ?? []).map((sv) => (
                <option key={sv.code} value={sv.code}>{sv.name}</option>
              ))}
        </select>
      )}
      {level === 'venue' && <span className="text-[11px] text-zinc-600">Enter to add</span>}
      {cancel}
      {error && <span className="text-[11px] text-pr-red">{error}</span>}
    </div>
  )
}
