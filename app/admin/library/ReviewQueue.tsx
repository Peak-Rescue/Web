'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { approveLibraryItems, setLibraryAudience, rejectLibraryItems } from './actions'
import LibraryRow from './LibraryRow'
import { AUDIENCE_META, type LibraryItem, type Venue } from '@/lib/library'

// Imported material, grouped by the Classroom topic it came from — which is
// also the section it becomes on a course. Reviewing a flat list of 800 rows
// asks the wrong question; reviewing "here is the Rappelling section, and here
// is who sees it" asks the right one.
export default function ReviewQueue({
  items,
  venues,
}: {
  items: LibraryItem[]
  venues: Venue[]
}) {
  const router = useRouter()
  const [busy, setBusy] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  // Group by source class → topic (the future section).
  const classes = new Map<string, Map<string, LibraryItem[]>>()
  for (const i of items) {
    const cls = i.source_class ?? 'Added in the portal'
    const topic = (i.source_topic ?? '').replace(/\(DO NOT POST\)/i, '').trim() || 'Ungrouped'
    if (!classes.has(cls)) classes.set(cls, new Map())
    const byTopic = classes.get(cls)!
    byTopic.set(topic, [...(byTopic.get(topic) ?? []), i])
  }

  async function run(key: string, fn: () => Promise<void>) {
    setBusy(key)
    try { await fn(); router.refresh() } finally { setBusy(null) }
  }

  return (
    <div className="space-y-8">
      {[...classes.entries()].map(([cls, byTopic]) => {
        const all = [...byTopic.values()].flat()
        return (
          <section key={cls}>
            <div className="flex items-center justify-between gap-3 flex-wrap mb-3 pb-2 border-b border-zinc-800">
              <div>
                <h2 className="text-base font-semibold">{cls}</h2>
                <p className="text-xs text-zinc-500 mt-0.5">
                  {all.length} item{all.length === 1 ? '' : 's'} in {byTopic.size} section
                  {byTopic.size === 1 ? '' : 's'}
                </p>
              </div>
              <button
                onClick={() => run(`cls:${cls}`, () => approveLibraryItems(all.map((i) => i.id)))}
                disabled={busy !== null}
                className="text-xs px-3 py-1.5 rounded bg-pr-red hover:bg-pr-red-dark text-white font-medium transition-colors disabled:opacity-40"
              >
                {busy === `cls:${cls}` ? 'Approving…' : 'Approve everything here'}
              </button>
            </div>

            <div className="space-y-3">
              {[...byTopic.entries()].map(([topic, group]) => {
                const key = `${cls}:${topic}`
                const open = expanded.has(key)
                const audiences = [...new Set(group.map((i) => i.audience))]
                const mixed = audiences.length > 1
                return (
                  <div key={key} className="border border-zinc-800 rounded-lg overflow-hidden">
                    <div className="flex items-center gap-3 px-3 py-2.5 bg-zinc-900 flex-wrap">
                      <button
                        onClick={() =>
                          setExpanded((p) => {
                            const n = new Set(p)
                            if (n.has(key)) n.delete(key)
                            else n.add(key)
                            return n
                          })
                        }
                        className="flex items-center gap-2 text-sm font-medium hover:text-white transition-colors"
                      >
                        <span className={`text-zinc-600 text-xs transition-transform ${open ? 'rotate-90' : ''}`}>▶</span>
                        {topic}
                        <span className="text-xs text-zinc-600 font-normal">{group.length}</span>
                      </button>

                      <div className="ml-auto flex items-center gap-2">
                        <span className="text-[11px] text-zinc-500">Who sees this section:</span>
                        <select
                          value={mixed ? '' : audiences[0]}
                          onChange={(e) =>
                            run(`aud:${key}`, () =>
                              setLibraryAudience(group.map((i) => i.id), e.target.value as 'internal' | 'shared')
                            )
                          }
                          disabled={busy !== null}
                          className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs focus:outline-none focus:border-zinc-500"
                        >
                          {mixed && <option value="">Mixed…</option>}
                          <option value="shared">{AUDIENCE_META.shared.choice}</option>
                          <option value="internal">{AUDIENCE_META.internal.choice}</option>
                        </select>
                        <button
                          onClick={() => run(`ok:${key}`, () => approveLibraryItems(group.map((i) => i.id)))}
                          disabled={busy !== null}
                          className="text-xs px-2.5 py-1 rounded bg-pr-red hover:bg-pr-red-dark text-white font-medium transition-colors disabled:opacity-40"
                        >
                          Approve
                        </button>
                        <button
                          onClick={() => {
                            if (confirm(`Skip all ${group.length} items in "${topic}"? They stay in the library as archived.`)) {
                              run(`no:${key}`, () => rejectLibraryItems(group.map((i) => i.id)))
                            }
                          }}
                          disabled={busy !== null}
                          className="text-xs text-zinc-600 hover:text-red-400 transition-colors"
                        >
                          Skip
                        </button>
                      </div>
                    </div>

                    {/* Collapsed: just the titles, so you can judge the section
                        at a glance. Expanded: full rows with edit. */}
                    {!open ? (
                      <ul className="px-3 py-2 text-xs text-zinc-500 space-y-0.5">
                        {group.slice(0, 6).map((i) => (
                          <li key={i.id} className="truncate">· {i.title}</li>
                        ))}
                        {group.length > 6 && <li className="text-zinc-600">…and {group.length - 6} more</li>}
                      </ul>
                    ) : (
                      <div className="p-2 space-y-2 bg-zinc-950/40">
                        {group.map((i) => (
                          <LibraryRow key={i.id} item={i} venues={venues} hideProvenance />
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </section>
        )
      })}
    </div>
  )
}
