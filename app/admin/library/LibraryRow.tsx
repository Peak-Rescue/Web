'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { updateLibraryItem, deleteLibraryItem, libraryItemUses, type LibraryItemUses } from './actions'
import { errorFrom, type ActionResult } from '@/lib/action-result'
import { KIND_META, AUDIENCE_META, bucketForKind, shelfOfRow, shelfLabel, type LibraryBucket, type LibraryItem, type Venue } from '@/lib/library'
import { AudiencePills } from '@/components/AudiencePills'
import { CAPABILITY_META, CAPABILITY_ORDER } from '@/lib/capabilities'
import MapLinks from './MapLinks'
import { NEEDS_SORTING } from '@/lib/sorting'
import PlaceSelect, { placeValue } from '@/components/PlaceSelect'
import { type SiteOption } from '@/app/admin/schedules/types'
import { COURSE_TYPE_OPTIONS, courseShortName } from '@/lib/courses'
import CloseButton from '@/components/CloseButton'
import TrashIcon from '@/components/TrashIcon'
import InfoHint from '@/components/InfoHint'
import FilingFields from '@/components/FilingFields'
import StateBadge from '@/components/StateBadge'
import KindOptions from '@/components/KindOptions'

const input =
  'w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-sm focus:outline-none focus:border-zinc-500'
const label = 'block text-[11px] text-zinc-500 mb-1'

export default function LibraryRow({ item, venues, sites = [], hideProvenance = false, initialOpen = false }: { item: LibraryItem; venues: Venue[]; sites?: SiteOption[]; hideProvenance?: boolean; initialOpen?: boolean }) {
  const router = useRouter()
  const [open, setOpen] = useState(initialOpen)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState({
    title: item.title,
    url: item.url ?? '',
    edit_url: item.edit_url ?? '',
    kind: item.kind,
    bucket: item.bucket as LibraryBucket | null,
    audience: item.audience,
    disciplines: item.disciplines,
    // The sorting mark is the software's, not a tag anyone typed, so it is
    // not in the box they type tags into — it was turning up there as a word
    // to remember to delete before saving. It comes off by itself when the
    // row says where it belongs.
    topicsRaw: item.topics.filter((t) => t !== NEEDS_SORTING).join(', '),
    description: item.description ?? '',
    place: placeValue(item.region, item.venue_id, item.site_id),
    course_types: item.course_types ?? [],
    admin_only: item.admin_only,
    expires_at: item.expires_at ?? '',
  })

  const venue = venues.find((v) => v.id === item.venue_id)
  const site = sites.find((x) => x.id === item.site_id)
  // Nothing is pending any more — see 257. The row still reads the state so
  // an older row rendered from a stale page does not lie about itself.
  const pending = item.status === 'pending'
  // A map filed nowhere is offered to nobody. Eleven of the twenty-three on
  // the shelf are in that state and nothing ever said so.
  const unplaced = item.kind === 'map' && !item.venue_id && !item.site_id

  // An expected refusal comes back as a value and is shown as it was written;
  // anything thrown is a fault, and errorFrom keeps its digest.
  async function run(fn: () => Promise<ActionResult>) {
    setBusy(true)
    setError(null)
    try {
      const result = await fn()
      router.refresh()
      if (result?.error) setError(result.error)
    } catch (e) {
      setError(errorFrom(e))
    } finally {
      setBusy(false)
    }
  }

  // Ask what is pointing at this item before asking whether to delete it. The
  // courses keep their own copy of the link either way — the point of saying so
  // is that "permanently" was true of the shelf copy and read as true of
  // everything, which is how a map disappeared off a course that had promoted
  // it.
  async function confirmDelete() {
    setBusy(true)
    setError(null)
    let uses: LibraryItemUses
    try {
      uses = await libraryItemUses(item.id)
    } catch (e) {
      setError(errorFrom(e, 'Could not check what is using this item.'))
      return
    } finally {
      setBusy(false)
    }

    // A template use, or an item with no link to hand back, is refused — and
    // the action's own refusal explains it better than a confirm could, so let
    // it do the talking rather than asking permission for a no.
    const blocked = uses.templates.length > 0 || (uses.maps + uses.resources + uses.items > 0 && !uses.hasLink)
    if (!blocked && !confirm(deletePrompt(uses))) return
    await run(() => deleteLibraryItem(item.id))
  }

  const save = () => run(async () => {
    if (form.kind === 'map' && !form.place) {
      return { error: 'A map needs a place — pick the area or the canyon it is about.' }
    }
    const { url, edit_url, place, ...rest } = form
    await updateLibraryItem(item.id, {
      ...rest,
      // A map's links live in their own table and are saved as they're edited;
      // sending these too would let a stale box overwrite them.
      ...(form.kind === 'map' ? {} : { url, edit_url }),
      place,
      expires_at: form.expires_at || null,
    })
    setOpen(false)
  })

  return (
    <div className={`rounded-lg border ${pending ? 'border-yellow-900/60 bg-yellow-950/10' : 'border-zinc-800 bg-zinc-900'}`}>
      <div className="flex items-start gap-3 px-3 py-2.5">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            {item.url ? (
              <a href={item.url} target="_blank" rel="noopener noreferrer" className="text-sm font-medium hover:text-pr-red-light transition-colors truncate">
                {item.title}
              </a>
            ) : (
              <span className="text-sm font-medium truncate">{item.title}</span>
            )}
            {/* Where it lives and what it is, in that order — the shelf is
                the thing you cannot see from a row sitting in a search
                result or in the import queue, and "Presentation" alone never
                said which of the seven cards it would turn up on. */}
            {KIND_META[item.kind as keyof typeof KIND_META] && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400">
                {shelfOfRow(item.kind, item.bucket) && (
                  <><span className="text-zinc-200 font-medium">{shelfLabel(shelfOfRow(item.kind, item.bucket)!)}</span><span className="text-zinc-600"> · </span></>
                )}
                {KIND_META[item.kind as keyof typeof KIND_META]}
              </span>
            )}
            {(item.course_types ?? []).map((ct) => (
              <span
                key={ct}
                title="Only offered to courses of this kind"
                className="text-[10px] px-1.5 py-0.5 rounded bg-blue-900/40 text-blue-300"
              >
                {courseShortName(ct, null)}
              </span>
            ))}
            <AudiencePills audience={item.audience} />
            {item.admin_only && (
              <span
                title="Only the admins see this, and it is never offered to a course"
                className="text-[10px] px-1.5 py-0.5 rounded bg-red-950/60 text-red-300"
              >
                Admin only
              </span>
            )}
            {site
              ? <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-900/40 text-blue-300">{site.name}</span>
              : venue && <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-900/40 text-blue-300">{venue.name}</span>}
            {/* The disciplines, up here with the rest of the tagging rather
                than in the grey line under it. Whether a row is properly
                tagged is the question this list is read with, and the answer
                was the one part of it written in the colour of a footnote.
                Outlined, because it is a property of the material and not a
                place, an offering or an audience — the three solid chips it
                sits beside. */}
            {item.disciplines.map((d) => (
              <span
                key={d}
                className="text-[10px] px-1.5 py-0.5 rounded border border-zinc-700 text-zinc-400"
              >
                {CAPABILITY_META[d as keyof typeof CAPABILITY_META]?.label ?? d}
              </span>
            ))}
            {unplaced && (
              <StateBadge title="Nothing will offer this map to a course until it says where it is">
                needs a place
              </StateBadge>
            )}
            {/* Left by the sorting pass rather than guessed at. The badge is
                the admission: a shelf that looks sorted never gets checked
                again, so the ones it could not place say so. */}
            {item.topics.includes(NEEDS_SORTING) && (
              <StateBadge title="The sorting pass couldn’t tell what this is — it is where it was, not where it belongs">
                needs sorting
              </StateBadge>
            )}
            {/* No "pending" badge. The row is already saying it twice —
                the amber border it is drawn in, and the Approve button that
                exists on no other row — and a third copy of one fact is what
                made a shelf of them hard to read. Archived keeps its word
                because nothing else on the row says it. */}
            {item.status === 'archived' && (
              <span className="text-[10px] px-1.5 py-0.5 rounded border border-zinc-700 text-zinc-500">
                archived
              </span>
            )}
            {item.topics.includes('needs-link-check') && (
              <StateBadge tone="broken">link may be dead</StateBadge>
            )}
          </div>
          <p className="text-[11px] text-zinc-600 mt-1 truncate">
            {item.source_type === 'file'
              ? 'uploaded file'
              : item.url
                ? new URL(item.url, 'https://x').hostname.replace('www.', '') || 'link'
                : 'no link'}
            {!hideProvenance && item.source_class && (
              <span className="text-zinc-700"> · from {item.source_class}</span>
            )}
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {pending && (
            <button
              onClick={() => run(() => updateLibraryItem(item.id, { status: 'published' }))}
              disabled={busy}
              className="text-xs px-2.5 py-1 rounded bg-pr-red hover:bg-pr-red-dark text-white font-medium transition-colors disabled:opacity-40"
            >
              Approve
            </button>
          )}
          {open ? (
          <CloseButton onClick={() => setOpen((v) => !v)} />
        ) : (
          <>
            <button onClick={() => setOpen((v) => !v)} className="text-xs text-zinc-400 hover:text-white transition-colors">Edit</button>
            {/* Beside Edit, not only inside it. Throwing a row out is a
                decision made while reading the list, and opening the editor
                to reach it meant opening fifty editors to clear fifty rows.
                Same confirm either way — it still says what is pointing at
                it before it asks. */}
            <button
              onClick={confirmDelete}
              disabled={busy}
              aria-label={`Delete ${item.title}`}
              className="text-xs text-zinc-600 hover:text-red-400 transition-colors disabled:opacity-40"
            >
              <TrashIcon />
            </button>
          </>
        )}
        </div>
      </div>

      {open && (
        <div className="px-3 pb-3 pt-1 border-t border-zinc-800 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <FilingFields
            value={{
              title: form.title,
              url: form.url,
              kind: form.kind,
              note: form.description,
              course_types: form.course_types,
              audience: form.admin_only ? 'admin' : form.audience,
              place: form.place,
              disciplines: form.disciplines,
              topicsRaw: form.topicsRaw,
            }}
            onChange={(next, changed) =>
              setForm({
                ...form,
                title: next.title,
                url: next.url,
                description: next.note,
                course_types: next.course_types,
                place: next.place,
                disciplines: next.disciplines,
                topicsRaw: next.topicsRaw,
                // The type decides the shelf; the two cannot be set apart.
                ...(changed === 'kind'
                  ? { kind: next.kind, ...(bucketForKind(next.kind) ? { bucket: bucketForKind(next.kind)! } : {}) }
                  : {}),
                // One ladder on the form, two fields underneath.
                ...(changed === 'audience'
                  ? next.audience === 'admin'
                    ? { admin_only: true, audience: 'internal' as const }
                    : { admin_only: false, audience: next.audience as 'internal' | 'shared' }
                  : {}),
              })
            }
            venues={venues}
            sites={sites}
            placeRequired={form.kind === 'map'}
            // A map's links are rows of their own, each with its own access
            // and audience, so they are managed here rather than typed into
            // two boxes that decided both at once.
            linkSlot={form.kind === 'map' ? <MapLinks itemId={item.id} links={item.links ?? []} /> : undefined}
            linkHint={form.kind === 'map' ? "A map's links are rows of their own, each with its own access and audience." : undefined}
            // In 820 items this has never once been filled in, including on
            // every permit. It stays for the kind it was built for and is out
            // of the way of everything else.
            extras={form.kind === 'permit' ? (
              <div>
                <label className={label}>Expires (permits, dated docs)</label>
                <input type="date" className={input} value={form.expires_at} onChange={(e) => setForm({ ...form, expires_at: e.target.value })} />
              </div>
            ) : null}
          />
          {item.topics.includes(NEEDS_SORTING) && (
            <p className="sm:col-span-2 -mt-2 text-[11px] text-zinc-600">
              Marked for sorting. Saying what this is, which shelf it is on, or where it
              is takes that off — a new title on its own does not.
            </p>
          )}
          <div className="sm:col-span-2 flex items-center gap-3">
            <button onClick={save} disabled={busy} className="px-3 py-1.5 rounded bg-pr-red hover:bg-pr-red-dark text-white text-sm font-medium transition-colors disabled:opacity-40">
              {busy ? 'Saving…' : 'Save'}
            </button>
            {item.status !== 'archived' && (
              <button onClick={() => run(() => updateLibraryItem(item.id, { status: 'archived' }))} disabled={busy} className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors">
                Archive
              </button>
            )}
            <button
              onClick={confirmDelete}
              disabled={busy}
              className="text-xs text-zinc-600 hover:text-red-400 transition-colors ml-auto"
            >
              Delete
            </button>
          </div>
          {error && <p className="sm:col-span-2 text-xs text-pr-red">{error}</p>}
        </div>
      )}
    </div>
  )
}

// What the delete is about to do, said before it is agreed to. Only the cases
// that will actually go through are worded here; the ones that get refused are
// worded once, in the action.
function deletePrompt(uses: LibraryItemUses): string {
  const attached = uses.maps + uses.resources + uses.items
  if (attached === 0) return 'Nothing is using this item. Delete it permanently?'
  const where = [
    uses.maps && `${uses.maps} map${uses.maps === 1 ? '' : 's'}`,
    uses.resources && `${uses.resources} resource${uses.resources === 1 ? '' : 's'}`,
    uses.items && `${uses.items} curriculum item${uses.items === 1 ? '' : 's'}`,
  ].filter(Boolean).join(', ')
  return `On ${uses.courses} course${uses.courses === 1 ? '' : 's'} (${where}).\n\nDeleting removes it from the library. Those courses keep the link as their own one-off copy, so nothing disappears off a course — but edits here will no longer reach them.\n\nDelete it permanently?`
}
