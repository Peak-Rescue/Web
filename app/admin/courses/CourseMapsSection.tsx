'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import AddLinkDialog from '@/components/AddLinkDialog'
import { AUDIENCE_META, type LibraryAudience } from '@/lib/library'
import {
  addCourseMapLink,
  addCourseMapsFromLibrary,
  loadMapLibrary,
  removeCourseMap,
  saveCourseMapToLibrary,
  setCourseMapAudience,
  type MapPickerItem,
} from './map-actions'

export type CourseMap = {
  id: string
  label: string
  url: string | null
  audience: LibraryAudience
  fromLibrary: boolean
  libraryLocked: boolean // library item is instructors-only — can't be shared here
}

// Maps for the course, sat with the location they belong to. Each row carries
// its own audience because the honest answer is per map: the overview goes to
// students, the evac plan does not.
export default function CourseMapsSection({
  instanceId,
  maps,
}: {
  instanceId: string
  maps: CourseMap[]
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [linkOpen, setLinkOpen] = useState(false)
  const [picker, setPicker] = useState<MapPickerItem[] | null>(null)
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
        setPicker(await loadMapLibrary(instanceId))
      } catch {
        setError('Could not load the map library.')
      } finally {
        setBusy(false)
      }
    }
  }

  const btn =
    'text-xs px-2.5 py-1.5 rounded border border-zinc-700 text-zinc-300 hover:text-white hover:border-zinc-500 transition-colors disabled:opacity-40'

  const available = (picker ?? []).filter((i) => !i.alreadyAdded)
    .sort((a, b) => Number(b.suggested) - Number(a.suggested) || a.title.localeCompare(b.title))

  return (
    <div>
      <h3 className="text-sm font-semibold text-zinc-400 mt-6 mb-1">Maps</h3>
      <p className="text-xs text-zinc-500 mb-3">
        CalTopo, SARTopo or anything else that shows where this course happens. Each map is instructors-only until
        you share it.
      </p>

      <div className="bg-zinc-900 border border-zinc-800 rounded-lg divide-y divide-zinc-800">
        {maps.length === 0 && (
          <p className="text-xs text-zinc-600 px-3 py-4">No maps on this course yet.</p>
        )}

        {maps.map((m) => (
          <div key={m.id} className="flex items-center gap-3 px-3 py-2.5">
            <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-zinc-500">
              <path d="M9 20l-5.447-2.724A1 1 0 0 1 3 16.382V5.618a1 1 0 0 1 1.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0 0 21 18.382V7.618a1 1 0 0 0-.553-.894L15 4m0 13V4m0 0L9 7" />
            </svg>

            <div className="min-w-0 flex-1">
              {m.url ? (
                <a href={m.url} target="_blank" rel="noreferrer" className="text-sm text-zinc-200 hover:text-white truncate block">
                  {m.label}
                </a>
              ) : (
                <span className="text-sm text-zinc-200 truncate block">{m.label}</span>
              )}
              {/* Provenance that goes somewhere: "from the library" is only
                  useful if it also gets you there. */}
              {m.fromLibrary ? (
                <Link
                  href="/admin/library?status=all&bucket=map"
                  className="text-[11px] text-zinc-600 hover:text-zinc-300 transition-colors"
                >
                  From the map library
                </Link>
              ) : (
                <span className="text-[11px] text-zinc-600">Link added for this course</span>
              )}
            </div>

            <select
              value={m.audience}
              disabled={busy || m.libraryLocked}
              title={m.libraryLocked ? 'Marked instructors-only in the library — change it there first.' : undefined}
              onChange={(e) =>
                run(() => setCourseMapAudience(instanceId, m.id, e.target.value as LibraryAudience))
              }
              className="shrink-0 bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs text-zinc-300 focus:outline-none focus:border-zinc-500 disabled:opacity-50"
            >
              <option value="internal">{AUDIENCE_META.internal.choice}</option>
              <option value="shared">{AUDIENCE_META.shared.choice}</option>
            </select>

            {!m.fromLibrary && (
              <button
                onClick={() => run(() => saveCourseMapToLibrary(instanceId, m.id))}
                disabled={busy}
                title="Add to the map library so other courses here can use it"
                className="shrink-0 text-zinc-500 hover:text-zinc-200 transition-colors text-xs disabled:opacity-40"
              >
                Save to library
              </button>
            )}

            <button
              onClick={() => run(() => removeCourseMap(instanceId, m.id))}
              disabled={busy}
              className="shrink-0 text-zinc-600 hover:text-pr-red transition-colors text-xs disabled:opacity-40"
            >
              Remove
            </button>
          </div>
        ))}
      </div>

      {error && <p className="text-xs text-pr-red mt-2">{error}</p>}

      <div className="flex items-center gap-2 mt-3">
        <button onClick={openPicker} disabled={busy} className={btn}>+ Choose from map library</button>
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
                    {i.venueName && (
                      <span className="text-[10px] px-1 rounded bg-blue-900/40 text-blue-300 shrink-0">{i.venueName}</span>
                    )}
                    {i.matchedOn === 'venue' && (
                      <span className="text-[10px] px-1 rounded bg-zinc-800 text-zinc-400 shrink-0">this venue</span>
                    )}
                    {i.matchedOn === 'region' && i.regionLabel && (
                      <span className="text-[10px] px-1 rounded bg-zinc-800 text-zinc-400 shrink-0">{i.regionLabel}</span>
                    )}
                    {i.audience === 'internal' && (
                      <span className="text-[10px] px-1 rounded bg-zinc-800 text-zinc-400 shrink-0">
                        {AUDIENCE_META.internal.badge}
                      </span>
                    )}
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
                Nothing in the map library yet — add a map under Library and set its library to Maps.
              </p>
            )}
            {picker === null && <p className="text-xs text-zinc-500 px-2.5 py-4">Loading maps…</p>}
          </div>

          <div className="flex items-center gap-3 mt-3">
            <button
              onClick={() =>
                run(async () => {
                  await addCourseMapsFromLibrary(instanceId, [...selected])
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
        onCancel={() => setLinkOpen(false)}
        onSubmit={(name, url) =>
          run(async () => {
            await addCourseMapLink(instanceId, url, name)
            setLinkOpen(false)
          })
        }
      />
    </div>
  )
}
