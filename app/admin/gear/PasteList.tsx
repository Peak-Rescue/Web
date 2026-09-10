'use client'

import { useMemo, useState } from 'react'
import { parsePastedGear, resettleSections, type PastedRow } from '@/lib/gear-paste'
import { KIT_LABEL, unwrap } from '@/lib/gear'
import { addGearEntries } from './actions'

// Pasting a list somebody already wrote.
//
// The alternative this replaces is real: twenty-three lines of a swiftwater
// standards document, added one at a time, each one a search and a destination
// and a button. The list took thirty seconds to write and twenty minutes to
// retype.
//
// So: paste, look at what it made of it, fix the two lines it got wrong, write
// once. The preview is not politeness — it is what licenses the parse to guess.
// Heading-or-gear is genuinely ambiguous for a line like "La Sportiva Canyon
// Boot", and a guess you can see and flip in one click is worth far more than a
// cleverer guess you cannot.
//
// Every row lands as free text. No catalog, no categories, no taxonomy on the
// way in — that is the whole point, and the thing that made this worth building
// rather than making the catalog deeper.
export default function PasteList({
  listId, instanceId, onDone, busy, run, input,
}: {
  listId: string
  instanceId: string | null
  onDone: (added: number) => void
  busy: boolean
  run: (fn: () => Promise<unknown>) => void
  input: string
}) {
  const [text, setText] = useState('')
  // Edits made in the preview, by index. Kept apart from the parse so that
  // changing the text re-parses cleanly rather than merging into corrections
  // that were about the old text.
  const [fixed, setFixed] = useState<Record<number, Partial<PastedRow>>>({})
  const [dropped, setDropped] = useState<Set<number>>(new Set())

  const parsed = useMemo(() => parsePastedGear(text), [text])

  const rows = useMemo(() => {
    const merged = parsed.rows.map((r, i) => ({ ...r, ...fixed[i] }))
    // Sections are re-derived rather than patched: flipping one line between
    // heading and gear changes what every line below it sits under, and
    // walking the list again is both cheaper and harder to get wrong.
    return resettleSections(merged)
  }, [parsed, fixed])

  const kept = rows.filter((_, i) => !dropped.has(i))
  const items = kept.filter((r) => !r.heading)

  const edit = (i: number, patch: Partial<PastedRow>) =>
    setFixed((f) => ({ ...f, [i]: { ...f[i], ...patch } }))

  const reset = () => { setText(''); setFixed({}); setDropped(new Set()) }

  const submit = () => run(async () => {
    const { added } = unwrap(await addGearEntries(
      listId,
      items.map((r) => ({
        name: r.name,
        note: r.note,
        section: r.section,
        groupType: r.groupType,
        each: r.each,
      })),
      instanceId
    ))
    reset()
    onDone(added)
  })

  return (
    <div className="rounded-lg border border-zinc-700 bg-zinc-900/60 p-3 space-y-3">
      <div>
        <p className="text-[11px] text-zinc-500 mb-1.5">
          Paste a list — an email, a handout, a standards document. Headings become
          sections, “4 carabiners” becomes a quantity, and anything after a dash
          becomes the note. Nothing is added to the catalog.
        </p>
        <textarea
          autoFocus
          value={text}
          onChange={(e) => { setText(e.target.value); setFixed({}); setDropped(new Set()) }}
          rows={text ? 6 : 10}
          placeholder={'Standard PPE\nSwiftwater-rated helmet\n4 carabiners\nVT prusik - Used for progress capture'}
          className={`${input} w-full font-mono text-[12px] leading-relaxed`}
        />
      </div>

      {text.trim() && (
        <>
          <div className="flex items-baseline gap-2 flex-wrap">
            <p className="text-[11px] uppercase tracking-widest text-zinc-500">
              What this would add
            </p>
            <span className="text-[11px] text-zinc-600">
              {items.length} {items.length === 1 ? 'row' : 'rows'}
              {kept.some((r) => r.heading) && ` under ${kept.filter((r) => r.heading).length} headings`}
              {' — check the two or three it got wrong'}
            </span>
          </div>

          <div className="rounded border border-zinc-800 divide-y divide-zinc-800/70 max-h-96 overflow-y-auto">
            {rows.map((r, i) => {
              const gone = dropped.has(i)
              return (
                <div
                  key={i}
                  className={`flex items-start gap-2 px-2 py-1.5 ${gone ? 'opacity-30' : ''} ${
                    r.heading ? 'bg-zinc-900' : ''
                  }`}
                >
                  {/* The one call the parse cannot make on its own. A product
                      named in title case on a line of its own looks exactly
                      like a heading, so the fix is one click rather than a
                      cleverer rule that would be wrong somewhere else. */}
                  <button
                    onClick={() => edit(i, { heading: !r.heading })}
                    disabled={gone}
                    title={r.heading ? 'This is gear, not a heading' : 'Make this a heading'}
                    className={`shrink-0 mt-px text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded border transition-colors ${
                      r.heading
                        ? 'border-zinc-600 text-zinc-300'
                        : 'border-transparent text-zinc-600 hover:border-zinc-700 hover:text-zinc-400'
                    }`}
                  >
                    {r.heading ? 'heading' : 'gear'}
                  </button>

                  <div className="min-w-0 flex-1">
                    <span className={r.heading ? 'text-sm font-medium' : 'text-sm'}>
                      {r.each != null && <span className="text-zinc-500">{r.each} × </span>}
                      {r.name}
                    </span>
                    {r.note && <span className="block text-[11px] text-zinc-500 mt-0.5">{r.note}</span>}
                  </div>

                  {/* Which half of the list, shown on the heading that decides
                      it rather than on each row under it — twenty chips saying
                      "personal" is noise, and the heading is where it would be
                      changed anyway. */}
                  {r.heading && (
                    <button
                      onClick={() => edit(i, { groupType: r.groupType === 'group' ? 'personal' : 'group' })}
                      disabled={gone}
                      title="Which half of the list this section belongs to"
                      className="shrink-0 text-[10px] px-1.5 py-0.5 rounded border border-zinc-700 text-zinc-400 hover:text-white hover:border-zinc-500 transition-colors"
                    >
                      {KIT_LABEL[r.groupType]}
                    </button>
                  )}

                  <button
                    onClick={() => setDropped((d) => {
                      const next = new Set(d)
                      if (next.has(i)) next.delete(i); else next.add(i)
                      return next
                    })}
                    title={gone ? 'Put it back' : 'Leave this line out'}
                    className="shrink-0 text-[11px] text-zinc-600 hover:text-white transition-colors px-1"
                  >
                    {gone ? '↩' : '×'}
                  </button>
                </div>
              )
            })}
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <button
              onClick={submit}
              disabled={busy || items.length === 0}
              className="px-3 py-1.5 rounded bg-pr-red hover:bg-pr-red-dark text-white text-sm font-medium transition-colors disabled:opacity-40"
            >
              Add {items.length} {items.length === 1 ? 'row' : 'rows'}
            </button>
            <button
              onClick={reset}
              className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              Clear
            </button>
            {parsed.intro && (
              <span className="text-[11px] text-zinc-600">
                Title line ignored — “{parsed.intro}” belongs in the list’s intro.
              </span>
            )}
          </div>
        </>
      )}
    </div>
  )
}
