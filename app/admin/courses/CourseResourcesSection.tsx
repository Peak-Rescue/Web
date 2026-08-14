'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import AddLinkDialog from '@/components/AddLinkDialog'
import { KIND_META, type LibraryAudience, type LibraryKind } from '@/lib/library'
import { AudiencePills } from '@/components/AudiencePills'
import AudienceToggle from '@/components/AudienceToggle'
import {
  addCourseResourceLink,
  addCourseResourcesFromLibrary,
  loadResourceLibrary,
  removeCourseResource,
  saveCourseResourceToLibrary,
  setCourseResourceAudience,
  type ResourcePickerItem,
} from './resource-actions'

export type CourseResource = {
  id: string
  label: string
  url: string | null
  audience: LibraryAudience
  fromLibrary: boolean
  libraryLocked: boolean // library item is instructors-only — can't be shared here
}

// Reference for the course, sat with the location it belongs to — the same
// place maps are chosen, because a med plan is answering the same question a
// map is: what is true about *this* place. Each row carries its own audience;
// the med plan goes to students, the annex behind it usually doesn't.
export default function CourseResourcesSection({
  instanceId,
  resources,
  placeLabel,
}: {
  instanceId: string
  resources: CourseResource[]
  // Venue name, or the region when there is no venue — what the library would
  // file a document under. Null when the course has neither set yet.
  placeLabel: string | null
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [linkOpen, setLinkOpen] = useState(false)
  const [picker, setPicker] = useState<ResourcePickerItem[] | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())

  async function run(fn: () => Promise<void>) {
    setBusy(true)
    setError(null)
    try {
      await fn()
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong — please try again.')
    } finally {
      setBusy(false)
    }
  }

  async function openPicker() {
    setPickerOpen(true)
    if (picker === null) {
      setBusy(true)
      try {
        setPicker(await loadResourceLibrary(instanceId))
      } catch {
        setError('Could not load the resource library.')
      } finally {
        setBusy(false)
      }
    }
  }

  const btn =
    'text-xs px-2.5 py-1.5 rounded border border-zinc-700 text-zinc-300 hover:text-white hover:border-zinc-500 transition-colors disabled:opacity-40'

  const available = (picker ?? [])
    .filter((i) => !i.alreadyAdded)
    .sort((a, b) => Number(b.suggested) - Number(a.suggested) || a.title.localeCompare(b.title))

  return (
    <div className="p-6 pt-5 border-t border-zinc-800">
      <h3 className="text-sm font-semibold text-zinc-300 mb-1">Resources</h3>
      <p className="text-xs text-zinc-500 mb-3">
        Med plans, permits, tech notes for this place — instructors-only until you share it.
        Students meet these in their own section, apart from the curriculum.
      </p>

      <div className="bg-zinc-950/40 border border-zinc-800 rounded-lg divide-y divide-zinc-800">
        {resources.length === 0 && (
          <p className="text-xs text-zinc-600 px-4 py-4">No resources on this course yet.</p>
        )}

        {resources.map((r) => (
          <div key={r.id} className="flex items-center gap-3 px-4 py-3">
            <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-zinc-500">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M16 13H8M16 17H8" />
            </svg>

            <div className="min-w-0 flex-1">
              {r.url ? (
                <a href={r.url} target="_blank" rel="noreferrer" className="text-sm text-zinc-200 hover:text-white truncate block">
                  {r.label}
                </a>
              ) : (
                <span className="text-sm text-zinc-200 truncate block">{r.label}</span>
              )}
              {r.fromLibrary ? (
                <Link
                  href="/admin/library?status=all&bucket=resource"
                  className="text-[11px] text-zinc-600 hover:text-zinc-300 transition-colors"
                >
                  From the resource library
                </Link>
              ) : (
                <span className="text-[11px] text-zinc-600">Link added for this course</span>
              )}
            </div>

            <span title={r.libraryLocked ? 'Marked instructors-only in the library — change it there first.' : undefined}>
              <AudienceToggle
                audience={r.audience}
                disabled={busy || r.libraryLocked}
                noun="this document"
                onChange={(next) => run(() => setCourseResourceAudience(instanceId, r.id, next))}
              />
            </span>

            {!r.fromLibrary && (
              <button
                onClick={() => run(() => saveCourseResourceToLibrary(instanceId, r.id))}
                disabled={busy}
                title="Save to the resource library so the next course here finds it"
                aria-label="Save to the resource library"
                className="shrink-0 text-zinc-600 hover:text-zinc-200 transition-colors disabled:opacity-40"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
                </svg>
              </button>
            )}

            <button
              onClick={() => run(() => removeCourseResource(instanceId, r.id))}
              disabled={busy}
              title="Remove from this course"
              aria-label="Remove from this course"
              className="shrink-0 text-zinc-600 hover:text-pr-red-light transition-colors text-sm leading-none disabled:opacity-40"
            >
              ×
            </button>
          </div>
        ))}
      </div>

      {error && <p className="text-xs text-pr-red mt-2">{error}</p>}

      <div className="flex items-center gap-2 mt-3">
        <button onClick={openPicker} disabled={busy} className={btn}>+ Choose from resource library</button>
        <button onClick={() => setLinkOpen(true)} disabled={busy} className={btn}>+ Add a link</button>
      </div>

      {pickerOpen && (
        <div className="mt-3 p-3 bg-zinc-950/60 border border-zinc-700 rounded-lg">
          <div className="max-h-64 overflow-y-auto divide-y divide-zinc-800/60 border border-zinc-800 rounded">
            {available.map((i) => (
              <label key={i.id} className="flex items-start gap-2.5 px-2.5 py-2 text-sm cursor-pointer hover:bg-zinc-800/50">
                <input
                  type="checkbox"
                  checked={selected.has(i.id)}
                  onChange={() =>
                    setSelected((prev) => {
                      const next = new Set(prev)
                      if (next.has(i.id)) next.delete(i.id)
                      else next.add(i.id)
                      return next
                    })
                  }
                  className="accent-red-600 mt-1 shrink-0"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="truncate">{i.title}</span>
                    <span className="text-[10px] px-1 rounded bg-zinc-800 text-zinc-400 shrink-0">
                      {KIND_META[i.kind as LibraryKind] ?? i.kind}
                    </span>
                    {i.venueName && (
                      <span className="text-[10px] px-1 rounded bg-blue-900/40 text-blue-300 shrink-0">{i.venueName}</span>
                    )}
                    {i.matchedOn === 'venue' && (
                      <span className="text-[10px] px-1 rounded bg-zinc-800 text-zinc-400 shrink-0">this venue</span>
                    )}
                    {i.matchedOn === 'region' && i.regionLabel && (
                      <span className="text-[10px] px-1 rounded bg-zinc-800 text-zinc-400 shrink-0">{i.regionLabel}</span>
                    )}
                    {i.audience === 'internal' && <AudiencePills audience="internal" className="shrink-0" />}
                  </div>
                </div>
                {i.url && (
                  <a
                    href={i.url}
                    target="_blank"
                    rel="noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    title="Open before adding"
                    className="shrink-0 text-zinc-600 hover:text-zinc-300 transition-colors mt-0.5"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14 21 3" />
                    </svg>
                  </a>
                )}
              </label>
            ))}
            {picker !== null && available.length === 0 && (
              <p className="text-xs text-zinc-500 px-2.5 py-4">
                Nothing on the resource shelf yet — add a link below and tick &ldquo;save to the
                resource library&rdquo; to put the first one there.
              </p>
            )}
            {picker === null && <p className="text-xs text-zinc-500 px-2.5 py-4">Loading resources…</p>}
          </div>

          <div className="flex items-center gap-3 mt-3">
            <button
              onClick={() =>
                run(async () => {
                  await addCourseResourcesFromLibrary(instanceId, [...selected])
                  setSelected(new Set())
                  setPickerOpen(false)
                  setPicker(null)
                })
              }
              disabled={busy || selected.size === 0}
              className="px-3 py-1.5 rounded bg-pr-red hover:bg-pr-red-dark text-white text-sm font-medium transition-colors disabled:opacity-40"
            >
              {busy ? 'Adding…' : selected.size ? `Add ${selected.size}` : 'Add'}
            </button>
            <button
              onClick={() => { setPickerOpen(false); setSelected(new Set()) }}
              className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <AddLinkDialog
        open={linkOpen}
        busy={busy}
        libraryPlace={placeLabel}
        onCancel={() => setLinkOpen(false)}
        onSubmit={(name, url, _audience, toLibrary) =>
          run(async () => {
            await addCourseResourceLink(instanceId, url, name, toLibrary)
            setLinkOpen(false)
            if (toLibrary) setPicker(null) // the shelf just changed
          })
        }
      />
    </div>
  )
}
