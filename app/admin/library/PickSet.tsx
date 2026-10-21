'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import LibraryRow from './LibraryRow'
import PlaceSelect from '@/components/PlaceSelect'
import TrashIcon from '@/components/TrashIcon'
import { errorFrom } from '@/lib/action-result'
import { KIND_META, type LibraryItem, type Venue } from '@/lib/library'
import { type SiteOption } from '@/app/admin/schedules/types'
import { COURSE_TYPE_OPTIONS, courseShortName } from '@/lib/courses'
import { AUDIENCE_META } from '@/lib/library'
import { CAPABILITY_META, CAPABILITY_ORDER } from '@/lib/capabilities'
import KindOptions from '@/components/KindOptions'
import {
  approveLibraryItems,
  setLibraryAudience,
  setLibraryDisciplines,
  rejectLibraryItems,
  setLibraryKind,
  setLibraryCourseType,
  setLibraryPlace,
  archiveLibraryItems,
  deleteLibraryItems,
} from './actions'

// Acting on the rows somebody ticked.
//
// This is what the group move should have been. That control sat on a heading
// and moved everything under it, and the heading was never a destination —
// seven items typed "Form" are a waiver, a kit list and an equipment log, so
// one click filed five of them wrongly. A ticked set is a destination: the
// person read each row and said these ones, and the three things they then
// want are the three things that are the same for all of them — what they are,
// where they are about, and that they are noise.
//
// Delete asks twice and names the count, because the first thing lost this way
// was a signed permit off a course setup.

export default function PickSet({
  items,
  venues,
  sites,
}: {
  items: LibraryItem[]
  venues: Venue[]
  sites: SiteOption[]
}) {
  const router = useRouter()
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [place, setPlace] = useState('')

  const ids = [...picked]
  const n = ids.length
  // Read off the selection rather than passed in: pending rows sit among the
  // published ones on a shelf now, so whether these two verbs apply is a
  // question about what was ticked, not about which list it was ticked on.
  const pending = items.some((i) => picked.has(i.id) && i.status === 'pending')
  const all = n > 0 && n === items.length

  const toggle = (id: string) =>
    setPicked((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  async function run(fn: () => Promise<void>, done?: string) {
    setBusy(true)
    setError(null)
    setNote(null)
    try {
      await fn()
      setPicked(new Set())
      setConfirming(false)
      setPlace('')
      if (done) setNote(done)
      router.refresh()
    } catch (e) {
      setError(errorFrom(e, 'That didn’t save'))
    } finally {
      setBusy(false)
    }
  }

  const bar =
    'text-[11px] px-2 py-1 rounded border border-zinc-700 text-zinc-300 hover:border-zinc-500 hover:text-white transition-colors disabled:opacity-40'

  return (
    <div className="space-y-2">
      {items.length > 0 && (
      <div className="flex items-center gap-3 flex-wrap text-[11px] text-zinc-500 px-1">
        <label className="inline-flex items-center gap-1.5 cursor-pointer hover:text-zinc-300 transition-colors">
          <input
            type="checkbox"
            checked={all}
            onChange={() => setPicked(all ? new Set() : new Set(items.map((i) => i.id)))}
            className="accent-pr-red"
          />
          {all ? 'None' : 'All'}
        </label>
        {n > 0 && <span className="text-zinc-300">{n} selected</span>}
      </div>
      )}

      {n > 0 && (
        // Sticky: the set is picked by scrolling, and a bar at the top of a
        // long group is a bar you have to scroll back to.
        <div className="sticky top-2 z-10 rounded-lg border border-zinc-700 bg-zinc-900/95 backdrop-blur p-2 space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            {pending && (
              <>
                {/* First, because on this list it is the usual answer: the
                    tagging is worth doing before approving, which is why
                    these sit at the end of the same bar rather than on a
                    screen of their own. */}
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => run(() => approveLibraryItems(ids), `${n} approved`)}
                  className="text-[11px] px-2 py-1 rounded bg-pr-red hover:bg-pr-red-dark text-white font-medium transition-colors disabled:opacity-40"
                >
                  Approve
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => run(() => rejectLibraryItems(ids), `${n} skipped`)}
                  title="Archived: it stays searchable and is never suggested"
                  className={bar}
                >
                  Skip
                </button>
              </>
            )}

            <select
              disabled={busy}
              defaultValue=""
              onChange={(e) => {
                const kind = e.target.value
                e.currentTarget.value = ''
                if (kind) run(() => setLibraryKind(ids, kind), `${n} typed as ${KIND_META[kind as keyof typeof KIND_META] ?? kind}`)
              }}
              className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-[11px] focus:outline-none focus:border-zinc-500"
            >
              <option value="">Set type…</option>
<KindOptions />
            </select>

            <select
              disabled={busy}
              defaultValue=""
              onChange={(e) => {
                const ct = e.target.value
                e.currentTarget.value = ''
                if (ct) run(() => setLibraryCourseType(ids, ct), `${n} tied to ${courseShortName(ct, null)}`)
              }}
              className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-[11px] focus:outline-none focus:border-zinc-500"
            >
              <option value="">Set offering…</option>
              {COURSE_TYPE_OPTIONS.map((g) => (
                <optgroup key={g.category} label={g.label}>
                  {g.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </optgroup>
              ))}
            </select>

            <select
              disabled={busy}
              defaultValue=""
              onChange={(e) => {
                const a = e.target.value as 'internal' | 'shared'
                e.currentTarget.value = ''
                if (a) run(() => setLibraryAudience(ids, a), `${n} set to “${AUDIENCE_META[a].choice}”`)
              }}
              className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-[11px] focus:outline-none focus:border-zinc-500"
            >
              <option value="">Who sees it…</option>
              <option value="internal">{AUDIENCE_META.internal.choice}</option>
              <option value="shared">{AUDIENCE_META.shared.choice}</option>
            </select>

            {/* Replaces rather than adds, which is right for the pile this
                is used on — nothing imported came with a discipline on it — and
                wrong enough on a tagged row to be worth saying out loud. */}
            <select
              disabled={busy}
              defaultValue=""
              title="Replaces whatever disciplines these carry"
              onChange={(e) => {
                const d = e.target.value
                e.currentTarget.value = ''
                if (d) run(() => setLibraryDisciplines(ids, [d]), `${n} tagged ${CAPABILITY_META[d as keyof typeof CAPABILITY_META]?.label ?? d}`)
              }}
              className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-[11px] focus:outline-none focus:border-zinc-500"
            >
              <option value="">Set discipline…</option>
              {CAPABILITY_ORDER.map((c) => (
                <option key={c} value={c}>{CAPABILITY_META[c].label}</option>
              ))}
            </select>

            <div className="flex items-center gap-1.5">
              <PlaceSelect
                name="bulk_place"
                placeholder="Set location…"
                venues={venues}
                sites={sites}
                value={place}
                onChange={setPlace}
                className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-[11px] focus:outline-none focus:border-zinc-500"
              />
              <button
                type="button"
                disabled={busy || !place}
                onClick={() => run(() => setLibraryPlace(ids, place), `${n} filed to where you picked`)}
                className={bar}
              >
                File here
              </button>
            </div>

            {/* Archive before delete, and worded as what it does: the row
                stops being offered anywhere but stays findable, which is what
                "get rid of it" means for something somebody may have to find
                once more. */}
            <button
              type="button"
              disabled={busy}
              onClick={() => run(() => archiveLibraryItems(ids), `${n} archived`)}
              className={bar}
            >
              Archive
            </button>

            <button
              type="button"
              disabled={busy}
              onClick={() => setConfirming(true)}
              className="text-[11px] px-2 py-1 rounded border border-zinc-700 text-zinc-500 hover:border-red-500/60 hover:text-red-400 transition-colors inline-flex items-center gap-1 disabled:opacity-40"
            >
              <TrashIcon /> Delete
            </button>
          </div>

          {confirming && (
            <div className="rounded border border-red-500/40 bg-red-500/5 p-2 space-y-2">
              <p className="text-[11px] text-zinc-300">
                Delete {n} {n === 1 ? 'item' : 'items'} permanently? Anything a template or a
                course is holding is kept and named back to you.
              </p>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    run(async () => {
                      const r = await deleteLibraryItems(ids)
                      setNote(
                        [
                          `${r.deleted} deleted`,
                          r.kept.length ? `${r.kept.length} kept: ${r.kept.map((k) => `“${k.title}” — ${k.reason}`).join(' · ')}` : '',
                        ]
                          .filter(Boolean)
                          .join('. ')
                      )
                    })
                  }
                  className="text-[11px] px-2 py-1 rounded border border-red-500/60 text-red-300 hover:bg-red-500/10 transition-colors disabled:opacity-40"
                >
                  {busy ? 'Deleting…' : `Delete ${n}`}
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setConfirming(false)}
                  className="text-[11px] text-zinc-500 hover:text-zinc-300 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {error && <p className="text-[11px] text-pr-red">{error}</p>}
          {note && <p className="text-[11px] text-zinc-400">{note}</p>}
        </div>
      )}

      {!n && note && <p className="text-[11px] text-zinc-400 px-1">{note}</p>}

      {items.map((it) => (
        <div key={it.id} className="flex items-start gap-2">
          <input
            type="checkbox"
            checked={picked.has(it.id)}
            onChange={() => toggle(it.id)}
            aria-label={`Select ${it.title}`}
            className="mt-3.5 shrink-0 accent-pr-red"
          />
          <div className="min-w-0 flex-1">
            <LibraryRow item={it} venues={venues} sites={sites} />
          </div>
        </div>
      ))}
    </div>
  )
}
