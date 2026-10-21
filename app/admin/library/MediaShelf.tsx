'use client'

import { useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { startGeneralUploads, recordGeneralUpload } from './media/actions'
import { disciplineLabels, type MediaAlbum } from '@/lib/media'
import LibraryRow from './LibraryRow'
import type { LibraryItem, Venue } from '@/lib/library'
import { type SiteOption } from '@/app/admin/schedules/types'
import { CAPABILITY_META, CAPABILITY_ORDER } from '@/lib/capabilities'
import { errorFrom } from '@/lib/action-result'

// Albums first, because that is how anyone remembers a photo — "the Maui
// trip", not "a picture of an anchor". The tags are underneath, inherited from
// the course each album came from, so "every canyon album" is one filter
// instead of opening fourteen albums to find out which ones were canyon
// courses.
export default function MediaShelf({
  albums,
  linked,
  venues,
  sites,
  discipline,
  hrefs,
  canUpload,
  canEdit,
}: {
  albums: MediaAlbum[]
  /** Albums kept somewhere else — Google Photos links, pasted Drive folders. */
  linked: LibraryItem[]
  venues: Venue[]
  sites: SiteOption[]
  discipline?: string | null
  /** Filter links, built by the page so they keep the rest of the query.
      A map rather than the function that built it: a function cannot cross
      into a client component, and the one that used to be passed here threw
      on every render of this shelf — which the build cannot see, because the
      prop type is satisfied either way. Keyed by discipline, with '' for
      all albums. */
  hrefs: Record<string, string>
  canUpload: boolean
  canEdit: boolean
}) {
  const router = useRouter()
  const file = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [tags, setTags] = useState<string[]>([])
  const [caption, setCaption] = useState('')

  // Tagged before the files go, because afterwards is when it stops happening.
  async function upload(files: FileList) {
    setError(null)
    setBusy('upload')
    try {
      const list = Array.from(files)
      const result = await startGeneralUploads(list.map((f) => ({ name: f.name, mimeType: f.type })))
      if ('error' in result) { setError(result.error); return }
      for (let i = 0; i < list.length; i++) {
        setBusy(`${i + 1} of ${list.length}`)
        const res = await fetch(result.sessions[i].uploadUrl, { method: 'PUT', body: list[i] })
        if (!res.ok) { setError(`${list[i].name} didn’t upload`); continue }
        const { id } = (await res.json()) as { id: string }
        await recordGeneralUpload(id, { disciplines: tags, caption: caption || null }).catch(() => {})
      }
      setCaption('')
      router.refresh()
    } catch (e) {
      setError(errorFrom(e, 'That upload didn’t finish'))
    } finally {
      setBusy(null)
      if (file.current) file.current.value = ''
    }
  }

  // Only the expertise actually represented, for the same reason the shelves
  // do it: a filter that returns nothing teaches nothing.
  const present = CAPABILITY_ORDER.filter((c) => albums.some((a) => a.disciplines.includes(c)))

  return (
    <div className="space-y-4">
      {present.length > 0 && (
        <div className="flex items-center gap-1.5 flex-wrap text-xs">
          <Link
            href={hrefs['']}
            scroll={false}
            className={`px-2 py-1 rounded transition-colors ${!discipline ? 'bg-zinc-800 text-white' : 'text-zinc-500 hover:text-zinc-300'}`}
          >
            All albums
          </Link>
          {present.map((c) => (
            <Link
              key={c}
              href={hrefs[c] ?? hrefs['']}
              scroll={false}
              className={`px-2 py-1 rounded transition-colors ${discipline === c ? 'bg-zinc-800 text-white' : 'text-zinc-500 hover:text-zinc-300'}`}
            >
              {CAPABILITY_META[c].label}
            </Link>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {albums.map((a) => {
          const inner = (
            <>
              <div className="flex items-baseline justify-between gap-3">
                <span className="font-medium text-sm truncate">{a.title}</span>
                <span className="text-xs text-zinc-500 shrink-0 tabular-nums">{a.count}</span>
              </div>
              {a.subtitle && <p className="text-[11px] text-zinc-600 mt-0.5 truncate">{a.subtitle}</p>}
              {a.disciplines.length > 0 && (
                <p className="text-[10px] text-zinc-600 mt-1.5 truncate">
                  {disciplineLabels(a.disciplines).join(' · ')}
                </p>
              )}
            </>
          )
          // The album, on its own page. It is the course's own gallery
          // loaded there, so there is still one lightbox and one Add button —
          // but somebody who clicked an album wanted the pictures, and a
          // course page scrolled to a heading was still the course page.
          return a.instanceId ? (
            <Link
              key={a.instanceId}
              href={`/admin/library/media/${a.instanceId}`}
              className="p-3 rounded-lg bg-zinc-900 border border-zinc-800 hover:border-pr-red transition-colors"
            >
              {inner}
            </Link>
          ) : (
            <div key="_general" className="p-3 rounded-lg bg-zinc-900 border border-zinc-800">
              {a.folderUrl ? (
                <a href={a.folderUrl} target="_blank" rel="noopener noreferrer" className="block hover:text-white transition-colors">
                  {inner}
                </a>
              ) : (
                inner
              )}
            </div>
          )
        })}
        {albums.length === 0 && (
          <p className="text-sm text-zinc-500">
            {discipline ? 'No albums tagged with that.' : 'Nothing has been shot yet.'}
          </p>
        )}
      </div>

      {linked.length > 0 && (
        <details className="group/linked rounded-lg border border-zinc-800 bg-zinc-900/60">
          <summary className="cursor-pointer list-none px-3 py-2.5 text-sm text-zinc-300 hover:text-white transition-colors flex items-center gap-2">
            <span className="text-zinc-600 inline-block transition-transform group-open/linked:rotate-90">▶</span>
            Albums kept somewhere else
            <span className="text-zinc-600 text-xs">{linked.length}</span>
            <span className="text-[11px] text-zinc-600 font-normal">Google Photos and pasted Drive folders</span>
          </summary>
          <div className="px-3 pb-3 space-y-2">
            {linked.map((i) =>
              canEdit
                ? <LibraryRow key={i.id} item={i} venues={venues} sites={sites} />
                : (
                  <a key={i.id} href={i.url ?? '#'} target="_blank" rel="noopener noreferrer"
                     className="block text-sm text-zinc-300 hover:text-white transition-colors truncate">
                    {i.title}
                  </a>
                )
            )}
          </div>
        </details>
      )}

      {canUpload && (
        <details className="group rounded-lg border border-zinc-800 bg-zinc-900/60">
          <summary className="cursor-pointer list-none px-3 py-2.5 text-sm text-zinc-300 hover:text-white transition-colors flex items-center gap-2">
            <span className="text-zinc-600 inline-block transition-transform group-open:rotate-90">▶</span>
            Add to the general album
          </summary>
          <div className="px-3 pb-3 space-y-3">
            {/* Asked before the files go. Afterwards is when it stops
                happening, and a drop is almost always one shoot of one thing. */}
            <div>
              <p className="text-[11px] text-zinc-500 mb-1">What this lot is of</p>
              <div className="flex flex-wrap gap-x-4 gap-y-1.5 p-2 bg-zinc-800/50 border border-zinc-700 rounded">
                {CAPABILITY_ORDER.map((c) => (
                  <label key={c} className="flex items-center gap-1.5 text-xs text-zinc-300 cursor-pointer">
                    <input
                      type="checkbox"
                      className="accent-red-600"
                      checked={tags.includes(c)}
                      onChange={() => setTags(tags.includes(c) ? tags.filter((x) => x !== c) : [...tags, c])}
                    />
                    {CAPABILITY_META[c].label}
                  </label>
                ))}
              </div>
            </div>
            <input
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              placeholder="A note about this lot (optional)"
              className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-sm focus:outline-none focus:border-zinc-500"
            />
            <input
              ref={file}
              type="file"
              multiple
              accept="image/*,video/*"
              disabled={busy !== null}
              onChange={(e) => e.target.files?.length && upload(e.target.files)}
              className="block w-full text-xs text-zinc-400 file:mr-3 file:rounded file:border-0 file:bg-zinc-800 file:px-3 file:py-1.5 file:text-xs file:text-zinc-200 hover:file:bg-zinc-700"
            />
            {busy && <p className="text-xs text-zinc-500">Uploading {busy === 'upload' ? '…' : busy}</p>}
            {error && <p className="text-xs text-pr-red">{error}</p>}
          </div>
        </details>
      )}
    </div>
  )
}
