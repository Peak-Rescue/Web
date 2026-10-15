'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { setLibraryBucket, setLibraryAdminOnly } from './actions'
import { BUCKET_META, BUCKET_ORDER, type LibraryBucket } from '@/lib/library'

/** Moving a whole kind-group off the shelf it is on.
 *
 * Standing on Reference and seeing seven forms, three Google Photos albums and
 * a permit is the moment you know they are misfiled — and until now the only
 * way to act on it was to open each row and change its shelf one at a time.
 * The sorting pass catches what the rules can guess; this catches what you can
 * see, which is a different and larger set.
 *
 * It moves the rows on this page, not the whole group, and says so when those
 * differ — the ids are what the page was given, and a control that silently
 * reached past them would be moving things nobody has looked at.
 */
export default function ShelfGroupMove({
  ids,
  from,
  total,
  label,
}: {
  ids: string[]
  from: LibraryBucket
  /** How many are in this group on the shelf, if more than are on this page. */
  total: number
  /** The kind, for the confirm — "7 forms", not "7 items". */
  label: string
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)

  const n = ids.length
  const partial = total > n

  async function run(fn: () => Promise<void>) {
    setBusy(true)
    try { await fn(); router.refresh() } finally { setBusy(false) }
  }

  // Inside a <summary>: without this, every click opens or closes the group
  // underneath the control instead of using it.
  const swallow = (e: React.MouseEvent | React.KeyboardEvent) => {
    e.stopPropagation()
    e.preventDefault()
  }

  return (
    <span className="ml-auto flex items-center gap-2 shrink-0" onClick={swallow}>
      <select
        defaultValue=""
        disabled={busy}
        onClick={swallow}
        onChange={(e) => {
          const to = e.target.value as LibraryBucket | 'admin' | ''
          e.currentTarget.value = ''
          if (!to) return
          const what = `${n}${partial ? ` of ${total}` : ''} ${label.toLowerCase()}`
          if (to === 'admin') {
            if (confirm(`Mark ${what} as admins only?\n\nOnly the five admins will see them, and they will never be offered to a course.`)) {
              run(() => setLibraryAdminOnly(ids, true))
            }
            return
          }
          if (confirm(`Move ${what} to ${BUCKET_META[to].label}?`)) {
            run(() => setLibraryBucket(ids, to))
          }
        }}
        className="bg-zinc-800 border border-zinc-700 rounded px-1.5 py-0.5 text-[11px] text-zinc-400 focus:outline-none focus:border-zinc-500"
      >
        <option value="">{busy ? 'Moving…' : `Move these ${n}…`}</option>
        {BUCKET_ORDER.filter((b) => b !== from && b !== 'map').map((b) => (
          <option key={b} value={b}>{BUCKET_META[b].label}</option>
        ))}
        <option value="admin">Admins only</option>
      </select>
    </span>
  )
}
