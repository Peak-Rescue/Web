'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { approveLibraryItems, setLibraryAudience, setLibraryDisciplines, rejectLibraryItems } from './actions'
import LibraryRow from './LibraryRow'
import { AUDIENCE_META, type LibraryItem, type Venue } from '@/lib/library'
import { CAPABILITY_META, CAPABILITY_ORDER } from '@/lib/capabilities'

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
                // What the whole section is tagged with, and what only some of
                // it is. Toggling works off the common set so a click means the
                // same thing whatever state the group arrived in.
                const common = CAPABILITY_ORDER.filter((c) => group.every((i) => i.disciplines.includes(c)))
                const union = CAPABILITY_ORDER.filter((c) => group.some((i) => i.disciplines.includes(c)))
                const partial = union.filter((c) => !common.includes(c))
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

                    {/* Expertise for the section, where the section is judged.
                        A Classroom topic is usually one answer for every item
                        under it, and tagging them singly is the step that gets
                        skipped — which puts items on the shelf that no course
                        will ever suggest, since discipline is one of the three
                        signals that floats one onto a course. Folded away,
                        because the summary is the part worth scanning. */}
                    <details className="group/exp border-t border-zinc-800 bg-zinc-900/40">
                      <summary className="cursor-pointer list-none flex items-center gap-2 px-3 py-1.5 text-[11px] text-zinc-500 hover:text-zinc-300 transition-colors">
                        <span className="text-zinc-600 inline-block transition-transform group-open/exp:rotate-90">▶</span>
                        <span className="shrink-0">Expertise</span>
                        <span className={union.length === 0 ? 'text-yellow-600/80 truncate' : 'text-zinc-400 truncate'}>
                          {union.length === 0
                            ? 'none set — nothing will suggest these'
                            : common.map((c) => CAPABILITY_META[c].label).join(', ') || 'mixed'}
                        </span>
                        {partial.length > 0 && (
                          <span className="text-zinc-600 shrink-0">
                            · some: {partial.map((c) => CAPABILITY_META[c].label).join(', ')}
                          </span>
                        )}
                      </summary>
                      <div className="flex flex-wrap gap-x-4 gap-y-1.5 px-3 pb-2.5 pt-0.5">
                        {CAPABILITY_ORDER.map((c) => (
                          <label key={c} className="flex items-center gap-1.5 text-xs text-zinc-300 cursor-pointer">
                            <input
                              type="checkbox"
                              className="accent-red-600"
                              checked={common.includes(c)}
                              ref={(el) => { if (el) el.indeterminate = partial.includes(c) }}
                              disabled={busy !== null}
                              onChange={() =>
                                run(`exp:${key}`, () =>
                                  setLibraryDisciplines(
                                    group.map((i) => i.id),
                                    common.includes(c) ? common.filter((x) => x !== c) : [...common, c]
                                  )
                                )
                              }
                            />
                            {CAPABILITY_META[c].label}
                          </label>
                        ))}
                      </div>
                    </details>

                    {/* Collapsed: just the titles, so you can judge the section
                        at a glance. Expanded: full rows with edit. */}
                    {!open ? (
                      <ul
                        onClick={() => setExpanded((p) => new Set(p).add(key))}
                        title="Open the section to edit these"
                        className="px-3 py-2 text-xs text-zinc-500 space-y-0.5 cursor-pointer hover:text-zinc-400 transition-colors"
                      >
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
