'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { setLibraryBucket } from './actions'
import LibraryRow from './LibraryRow'
import { BUCKET_META, type LibraryBucket, type LibraryItem, type Venue } from '@/lib/library'
import { type SiteOption } from '@/app/admin/schedules/types'

// Resorting the shelf someone else built.
//
// 822 items came over from Classroom filed by which class they were posted in,
// which says nothing about what they are — logos and rope technique share a
// shelf because they were posted to the same room. The guess that fixes that
// is cheap to make and must never be applied on its own: a shelf that has been
// auto-sorted looks exactly like a shelf that has been sorted, and nobody ever
// re-checks the second one.
//
// So this proposes, in the only grouping that makes the proposal checkable —
// by the move itself. "78 things on the instructor shelf look like reference"
// is a claim you can agree with at a glance and refuse at a glance. Opening
// the group gives the ordinary library row, so a single wrong one is corrected
// where it sits rather than making the whole group unacceptable.
export default function SortQueue({
  groups,
  unguessed,
  venues,
  sites,
}: {
  groups: { from: LibraryBucket; to: LibraryBucket; items: LibraryItem[] }[]
  /** How many the rules declined to guess at — the honest half of the number. */
  unguessed: number
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
    return (
      <p className="text-sm text-zinc-500">
        Nothing looks misfiled. {unguessed} item{unguessed === 1 ? '' : 's'} the rules
        wouldn&rsquo;t guess at — those are browsed on their shelves, not sorted from here.
      </p>
    )
  }

  const total = groups.reduce((n, g) => n + g.items.length, 0)

  return (
    <div className="space-y-3">
      <p className="text-xs text-zinc-500">
        {total} item{total === 1 ? '' : 's'} look misfiled, grouped by the move.
        {' '}
        <span className="text-zinc-600">
          {unguessed} more the rules wouldn&rsquo;t guess at and left alone.
        </span>
      </p>

      {groups.map((g) => {
        const key = `${g.from}:${g.to}`
        const isOpen = open.has(key)
        return (
          <div key={key} className="border border-zinc-800 rounded-lg overflow-hidden">
            <div className="flex items-center gap-3 px-3 py-2.5 bg-zinc-900 flex-wrap">
              <button
                onClick={() =>
                  setOpen((p) => {
                    const n = new Set(p)
                    if (n.has(key)) n.delete(key)
                    else n.add(key)
                    return n
                  })
                }
                className="flex items-center gap-2 text-sm font-medium hover:text-white transition-colors"
              >
                <span className={`text-zinc-600 text-xs transition-transform ${isOpen ? 'rotate-90' : ''}`}>▶</span>
                <span className="text-zinc-400">{BUCKET_META[g.from].label}</span>
                <span className="text-zinc-600">→</span>
                <span>{BUCKET_META[g.to].label}</span>
                <span className="text-xs text-zinc-600 font-normal">{g.items.length}</span>
              </button>

              <button
                onClick={() => run(key, () => setLibraryBucket(g.items.map((i) => i.id), g.to))}
                disabled={busy !== null}
                className="ml-auto text-xs px-2.5 py-1 rounded bg-pr-red hover:bg-pr-red-dark text-white font-medium transition-colors disabled:opacity-40"
              >
                {busy === key ? 'Moving…' : `Move all ${g.items.length}`}
              </button>
            </div>

            {/* Collapsed: the titles, which is what you judge the claim on.
                Open: the rows, where one wrong item is fixed without having to
                reject the other seventy-seven. */}
            {!isOpen ? (
              <ul
                onClick={() => setOpen((p) => new Set(p).add(key))}
                title="Open to check these one at a time"
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
