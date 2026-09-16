'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { updateLibraryItem, deleteLibraryItem, libraryItemUses, type LibraryItemUses } from './actions'
import { errorFrom, type ActionResult } from '@/lib/action-result'
import { KIND_META, LIBRARY_KINDS, AUDIENCE_META, BUCKET_META, BUCKET_ORDER, type LibraryBucket, type LibraryItem, type Venue } from '@/lib/library'
import { AudiencePills } from '@/components/AudiencePills'
import { CAPABILITY_META, CAPABILITY_ORDER } from '@/lib/capabilities'
import RegionSelect from '@/components/RegionSelect'
import MapLinks from './MapLinks'
import CloseButton from '@/components/CloseButton'

const input =
  'w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-sm focus:outline-none focus:border-zinc-500'
const label = 'block text-[11px] text-zinc-500 mb-1'

export default function LibraryRow({ item, venues, hideProvenance = false }: { item: LibraryItem; venues: Venue[]; hideProvenance?: boolean }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState({
    title: item.title,
    url: item.url ?? '',
    edit_url: item.edit_url ?? '',
    kind: item.kind,
    bucket: item.bucket ?? 'resource',
    audience: item.audience,
    disciplines: item.disciplines,
    topicsRaw: item.topics.join(', '),
    venue_id: item.venue_id ?? '',
    region: item.region ?? '',
    expires_at: item.expires_at ?? '',
  })

  const venue = venues.find((v) => v.id === item.venue_id)
  const pending = item.status === 'pending'

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
    const { url, edit_url, ...rest } = form
    await updateLibraryItem(item.id, {
      ...rest,
      // A map's links live in their own table and are saved as they're edited;
      // sending these too would let a stale box overwrite them.
      ...(form.kind === 'map' ? {} : { url, edit_url }),
      venue_id: form.venue_id || null,
      region: form.region || null,
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
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400">
              {KIND_META[item.kind as keyof typeof KIND_META] ?? item.kind}
            </span>
            <AudiencePills audience={item.audience} />
            {venue && <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-900/40 text-blue-300">{venue.name}</span>}
            {item.topics.includes('needs-link-check') && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-900/40 text-red-300">link may be dead</span>
            )}
          </div>
          <p className="text-[11px] text-zinc-600 mt-1 truncate">
            {item.url ? new URL(item.url, 'https://x').hostname.replace('www.', '') || 'link' : 'no link'}
            {' · '}
            {item.disciplines.map((d) => CAPABILITY_META[d as keyof typeof CAPABILITY_META]?.label ?? d).join(', ') || 'no expertise tag'}
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
          <button onClick={() => setOpen((v) => !v)} className="text-xs text-zinc-400 hover:text-white transition-colors">Edit</button>
        )}
        </div>
      </div>

      {open && (
        <div className="px-3 pb-3 pt-1 border-t border-zinc-800 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="sm:col-span-2">
            <label className={label}>Title</label>
            <input className={input} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </div>
          {/* A map's links are rows of their own, each with its own access
              and audience, so they are managed here rather than typed into two
              boxes that decided both at once. Everything else has one link. */}
          {form.kind === 'map' ? (
            <div className="sm:col-span-2">
              <MapLinks itemId={item.id} links={item.links ?? []} />
            </div>
          ) : (
            <div className="sm:col-span-2">
              <label className={label}>Link</label>
              <input className={input} value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} />
            </div>
          )}
          {/* Only maps are filed by place — it's how a course finds the ones
              that belong where it's running. */}
          {form.kind === 'map' && (
          <div>
            <label className={label}>State / country</label>
            <RegionSelect
              defaultValue={form.region}
              className={input}
              onChange={(code) => setForm({ ...form, region: code })}
            />
          </div>
          )}
          {/* A map has one shelf and the type already named it. */}
          {form.kind !== 'map' && (
            <div>
              <label className={label}>Library</label>
              <select className={input} value={form.bucket} onChange={(e) => setForm({ ...form, bucket: e.target.value as LibraryBucket })}>
                {BUCKET_ORDER.map((b) => <option key={b} value={b}>{BUCKET_META[b].label}</option>)}
              </select>
            </div>
          )}
          <div>
            <label className={label}>Type</label>
            <select className={input} value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>
              {LIBRARY_KINDS.map((k) => <option key={k} value={k}>{KIND_META[k]}</option>)}
            </select>
          </div>
          <div>
            <label className={label}>Who can see it</label>
            <select className={input} value={form.audience} onChange={(e) => setForm({ ...form, audience: e.target.value as 'internal' | 'shared' })}>
              <option value="internal">{AUDIENCE_META.internal.choice}</option>
              <option value="shared">{AUDIENCE_META.shared.choice}</option>
            </select>
          </div>
          <div>
            <label className={label}>Venue</label>
            <select className={input} value={form.venue_id} onChange={(e) => setForm({ ...form, venue_id: e.target.value })}>
              <option value="">— none —</option>
              {venues.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
            </select>
          </div>
          {/* In 820 items this has never once been filled in, including on
              every permit in there. It stays for the kind it was built for and
              is out of the way of everything else. */}
          {form.kind === 'permit' && (
          <div>
              <label className={label}>Expires (permits, dated docs)</label>
              <input type="date" className={input} value={form.expires_at} onChange={(e) => setForm({ ...form, expires_at: e.target.value })} />
            </div>
          )}
          <div className="sm:col-span-2">
            <label className={label}>Disciplines</label>
            <div className="flex flex-wrap gap-x-4 gap-y-1.5 p-2 bg-zinc-800/50 border border-zinc-700 rounded">
              {CAPABILITY_ORDER.map((c) => (
                <label key={c} className="flex items-center gap-1.5 text-xs text-zinc-300 cursor-pointer">
                  <input
                    type="checkbox"
                    className="accent-red-600"
                    checked={form.disciplines.includes(c)}
                    onChange={() => setForm({
                      ...form,
                      disciplines: form.disciplines.includes(c)
                        ? form.disciplines.filter((x) => x !== c)
                        : [...form.disciplines, c],
                    })}
                  />
                  {CAPABILITY_META[c].label}
                </label>
              ))}
            </div>
          </div>
          <div className="sm:col-span-2">
            <label className={label}>Topic tags (comma separated)</label>
            <input className={input} value={form.topicsRaw} onChange={(e) => setForm({ ...form, topicsRaw: e.target.value })} />
          </div>
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
