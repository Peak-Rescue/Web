'use client'

import { useRef, useState } from 'react'
import { CAPABILITY_META, CAPABILITY_ORDER } from '@/lib/capabilities'
import {
  ACCESS_META, LINK_AUDIENCE_META, KIND_META,
  bucketForKind, type Venue,
} from '@/lib/library'
import { createLibraryItem, createLibraryUploadTarget } from './actions'
import { createClient } from '@/lib/supabase/client'
import PlaceSelect from '@/components/PlaceSelect'
import { type SiteOption } from '@/app/admin/schedules/types'
import KindOptions from '@/components/KindOptions'

// Adding something to the library, asking what that thing needs and nothing
// else.
//
// The type comes first because it decides the rest of the questions. A map
// wants a place and links that carry their own access; a permit wants a date;
// most things want neither, and asking anyway trained everyone to scroll past
// fields — including the two that mattered. It also asked which library twice
// over for a map, once as the type and once as the shelf, when a map only ever
// belongs on one.

const input = 'w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-zinc-500'
const label = 'block text-[11px] text-zinc-500 mb-1'

export default function AddLibraryItem({
  venues,
  sites,
  defaultBucket,
  defaultKind,
}: {
  venues: Venue[]
  sites: SiteOption[]
  /** The shelf being stood on. The button has said "Add to Reference" since it
      was written and then opened a form defaulted to something else, so the
      first thing added to a shelf landed on a different one. */
  defaultBucket?: string
  /** The shelf's own type, where the shelf has one: Gear lists means a gear
      list, and arriving with "Manual" selected there is a form asking a
      question the door already answered. */
  defaultKind?: string
}) {
  // Blank, not the first type in the list. It held 'reference', which is not
  // in the list, so the browser drew the first option — "Presentation" — while
  // the form carried something else: a select showing one answer and posting
  // another, on the field that decides the shelf.
  const [kind, setKind] = useState(defaultKind ?? '')
  const [bucket, setBucket] = useState(defaultBucket ?? 'resource')
  const isMap = kind === 'map'
  const isPermit = kind === 'permit'
  // A file or a link: either is what the thing is, the questions are the
  // same. Before, a file could reach the library only by being uploaded onto
  // some course first — which also filed it under that course's place.
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const titleRef = useRef<HTMLInputElement>(null)

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = e.currentTarget
    const data = new FormData(form)
    setBusy(true)
    setError(null)
    try {
      if (file) {
        const target = await createLibraryUploadTarget(file.name, file.size)
        if ('error' in target) throw new Error(target.error)
        const { error: upErr } = await createClient().storage
          .from('task-documents')
          .uploadToSignedUrl(target.path, target.token, file, { contentType: file.type })
        if (upErr) throw new Error(`Upload failed: ${upErr.message}`)
        data.set('storage_path', target.path)
        data.set('filename', file.name)
        data.delete('url')
      }
      await createLibraryItem(data)
      form.reset()
      setFile(null)
      setKind(defaultKind ?? '')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That didn’t save')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form
      onSubmit={submit}
      className="mt-3 p-4 bg-zinc-900 border border-zinc-800 rounded-lg grid grid-cols-1 sm:grid-cols-2 gap-3"
    >
      <div>
        <label className={label}>Type</label>
        <select
          name="kind"
          value={kind}
          onChange={(e) => {
            setKind(e.target.value)
            const shelf = bucketForKind(e.target.value)
            if (shelf) setBucket(shelf)
          }}
          className={input}
        >
          {/* Asked, unless the shelf already answered it — Gear lists means
              a gear list. Otherwise it opens blank and stays blank until
              somebody says, because a type nobody chose is a row filed on a
              shelf nobody meant. */}
          {!kind && <option value="">— what is it? —</option>}
          <KindOptions />
        </select>
      </div>
      <div>
        <label className={label}>Who can see it</label>
        <select name="audience" className={input} defaultValue="internal">
          <option value="internal">Instructors only</option>
          <option value="shared">Students &amp; instructors</option>
          {/* Permits, MOUs, COIs, operational plans. Stored as its own flag
              rather than a third audience, so it can only add a restriction —
              but it is plainly the third rung to whoever is setting it. */}
          <option value="admin">Admins only — and never on a course</option>
        </select>
      </div>

      <div className="sm:col-span-2">
        <label className={label}>Title *</label>
        <input ref={titleRef} name="title" required className={input} />
      </div>

      {file ? (
        <div className="sm:col-span-2">
          <label className={label}>File</label>
          <div className="flex items-center gap-3 text-sm text-zinc-200">
            <span className="truncate">{file.name}</span>
            <button type="button" onClick={() => setFile(null)} className="text-xs text-zinc-500 hover:text-zinc-300 shrink-0">
              Use a link instead
            </button>
          </div>
        </div>
      ) : (
        <div className="sm:col-span-2">
          <label className={label}>{isMap ? 'Link to the map' : 'Link (Drive, YouTube, or any URL)'}</label>
          <div className="flex gap-2">
            <input name="url" className={input} />
            {/* A map is a CalTopo link; there is no file to upload. */}
            {!isMap && (
              <label className="shrink-0 px-3 py-2 rounded border border-dashed border-zinc-700 hover:border-zinc-500 text-sm text-zinc-300 cursor-pointer transition-colors">
                or upload a file
                <input
                  type="file"
                  className="hidden"
                  onChange={(e) => {
                    const picked = e.target.files?.[0] ?? null
                    e.target.value = ''
                    if (!picked) return
                    setFile(picked)
                    // Named after the file until somebody says otherwise.
                    if (titleRef.current && !titleRef.current.value.trim()) {
                      titleRef.current.value = picked.name.replace(/\.[a-z0-9]{1,5}$/i, '') || picked.name
                    }
                  }}
                />
              </label>
            )}
          </div>
        </div>
      )}

      {/* A map's first link says what it is; the rest are added on the item
          once it exists, where they can be seen next to each other. */}
      {isMap && (
        <>
          <div>
            <label className={label}>What that link is</label>
            <select name="link_access" className={input} defaultValue="read">
              {(['read', 'edit'] as const).map((a) => <option key={a} value={a}>{ACCESS_META[a]}</option>)}
            </select>
          </div>
          <div>
            <label className={label}>Who that link is for</label>
            <select name="link_audience" className={input} defaultValue="students">
              {(['students', 'instructors'] as const).map((a) => (
                <option key={a} value={a}>{LINK_AUDIENCE_META[a]}</option>
              ))}
            </select>
          </div>
        </>
      )}

      {/* A map is about a place or it is not a map anyone can find: filed
          nowhere it is offered to no course, which is how eleven of the
          twenty-three already on the shelf ended up unfiled without anyone
          noticing. So for a map the question is required and takes either
          level — the area, or the canyon inside it. Everything else is filed
          by place only when it happens to be about one. */}

      <div className="sm:col-span-2">
        <label className={label}>
          {isMap ? 'Location * — country, state, venue or canyon' : 'Location — country, state, venue or canyon'}
        </label>
        <PlaceSelect
          name="place"
          venues={venues}
          sites={sites}
          required={isMap}
          className={input}
        />
      </div>

      {/* A map has one shelf and the type already named it. */}
      {/* The type decides it, so it is carried rather than asked for. */}
      {!isMap && <input type="hidden" name="bucket" value={bucket} />}

      {isPermit && (
        <div>
          <label className={label}>Expires</label>
          <input type="date" name="expires_at" className={input} />
        </div>
      )}

      <div className="sm:col-span-2">
        <label className={label}>Disciplines</label>
        <div className="flex flex-wrap gap-x-4 gap-y-1.5 p-2 bg-zinc-800/50 border border-zinc-700 rounded">
          {CAPABILITY_ORDER.map((c) => (
            <label key={c} className="flex items-center gap-1.5 text-xs text-zinc-300 cursor-pointer">
              <input type="checkbox" name="disciplines" value={c} className="accent-red-600" />
              {CAPABILITY_META[c].label}
            </label>
          ))}
        </div>
      </div>
      <div className="sm:col-span-2">
        <label className={label}>Topic tags (comma separated)</label>
        <input name="topics" className={input} placeholder="Rappelling, Anchors" />
      </div>

      <div className="sm:col-span-2 flex items-center gap-3">
        <button
          disabled={busy}
          className="px-4 py-2 bg-pr-red hover:bg-pr-red-dark text-white rounded text-sm font-medium transition-colors disabled:opacity-50"
        >
          {busy ? (file ? 'Uploading…' : 'Adding…') : 'Add to library'}
        </button>
        {error && <span className="text-xs text-amber-400">{error}</span>}
      </div>
    </form>
  )
}
