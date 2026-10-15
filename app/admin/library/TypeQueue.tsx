'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { setLibraryKind, setLibraryAdminOnly } from './actions'
import LibraryRow from './LibraryRow'
import { KIND_META, LIBRARY_KINDS, type LibraryItem, type Venue } from '@/lib/library'
import { type SiteOption } from '@/app/admin/schedules/types'

// Saying what things ARE.
//
// 420 published items carry the catch-all type, because that is all the
// Classroom import could tell from a file name. It is the single biggest
// reason the shelves do not read the way they were drawn: open Reference and
// the bullets you wrote — manuals, standards, tech notes — collapse into one
// pile called "Reference", which is not a type, it is the absence of one.
//
// Grouped by the room each batch was posted in, because things posted together
// are usually the same kind of thing. That is the only reason 420 is
// tractable: "Product Manuals/Tech Notes" is fourteen items and one answer.
export default function TypeQueue({
  groups,
  venues,
  sites,
}: {
  groups: { key: string; label: string; items: LibraryItem[] }[]
  venues: Venue[]
  sites: SiteOption[]
}) {
  const router = useRouter()
  const [busy, setBusy] = useState<string | null>(null)
  const [open, setOpen] = useState<Set<string>>(new Set())

  async function run(key: string, fn: () => Promise<void>) {
    setBusy(key)
    try { await fn(); router.refresh() } finally { setBusy(null) }
  }

  if (groups.length === 0) {
    return <p className="text-sm text-zinc-500">Everything published says what it is.</p>
  }

  const total = groups.reduce((n, g) => n + g.items.length, 0)

  return (
    <div className="space-y-3">
      <p className="text-xs text-zinc-500">
        {total} item{total === 1 ? '' : 's'} have no type beyond the catch-all, grouped by where they were posted.
      </p>

      {groups.map((g) => {
        const isOpen = open.has(g.key)
        return (
          <div key={g.key} className="border border-zinc-800 rounded-lg overflow-hidden">
            <div className="flex items-center gap-3 px-3 py-2.5 bg-zinc-900 flex-wrap">
              <button
                onClick={() =>
                  setOpen((p) => {
                    const n = new Set(p)
                    if (n.has(g.key)) n.delete(g.key)
                    else n.add(g.key)
                    return n
                  })
                }
                className="flex items-center gap-2 text-sm font-medium hover:text-white transition-colors min-w-0"
              >
                <span className={`text-zinc-600 text-xs transition-transform shrink-0 ${isOpen ? 'rotate-90' : ''}`}>▶</span>
                <span className="truncate">{g.label}</span>
                <span className="text-xs text-zinc-600 font-normal shrink-0">{g.items.length}</span>
              </button>

              <div className="ml-auto flex items-center gap-2">
                {/* One answer for the batch. Nothing is preselected: a type
                    chosen by a dropdown's default is a type nobody chose. */}
                <select
                  defaultValue=""
                  disabled={busy !== null}
                  onChange={(e) => {
                    const kind = e.target.value
                    e.currentTarget.value = ''
                    if (kind) run(g.key, () => setLibraryKind(g.items.map((i) => i.id), kind))
                  }}
                  className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs focus:outline-none focus:border-zinc-500"
                >
                  <option value="">These are all…</option>
                  {LIBRARY_KINDS.filter((k) => k !== 'reference').map((k) => (
                    <option key={k} value={k}>{KIND_META[k]}</option>
                  ))}
                </select>
                {/* Permits and COIs usually arrive as a batch of their own, and
                    the two answers wanted for that batch are "these are
                    permits" and "and only we see them". */}
                <button
                  onClick={() => run(`${g.key}:admin`, () => setLibraryAdminOnly(g.items.map((i) => i.id), true))}
                  disabled={busy !== null}
                  title="Only the admins see these, and they are never offered to a course"
                  className="text-xs text-zinc-600 hover:text-red-300 transition-colors disabled:opacity-40"
                >
                  Admins only
                </button>
              </div>
            </div>

            {!isOpen ? (
              <ul
                onClick={() => setOpen((p) => new Set(p).add(g.key))}
                title="Open to set these one at a time"
                className="px-3 py-2 text-xs text-zinc-500 space-y-0.5 cursor-pointer hover:text-zinc-400 transition-colors"
              >
                {g.items.slice(0, 6).map((i) => (
                  <li key={i.id} className="truncate">· {i.title}</li>
                ))}
                {g.items.length > 6 && <li className="text-zinc-600">…and {g.items.length - 6} more</li>}
              </ul>
            ) : (
              <div className="p-2 space-y-2 bg-zinc-950/40">
                {g.items.map((i) => (
                  <LibraryRow key={i.id} item={i} venues={venues} sites={sites} />
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
