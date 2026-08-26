'use client'

import { useState } from 'react'
import RegionSelect from '@/components/RegionSelect'
import { CAPABILITY_META, CAPABILITY_ORDER } from '@/lib/capabilities'
import {
  ACCESS_META, LINK_AUDIENCE_META, KIND_META, LIBRARY_KINDS,
  BUCKET_META, BUCKET_ORDER, type Venue,
} from '@/lib/library'
import { createLibraryItem } from './actions'

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

export default function AddLibraryItem({ venues }: { venues: Venue[] }) {
  const [kind, setKind] = useState('reference')
  const isMap = kind === 'map'
  const isPermit = kind === 'permit'

  return (
    <form
      action={createLibraryItem}
      className="mt-3 p-4 bg-zinc-900 border border-zinc-800 rounded-lg grid grid-cols-1 sm:grid-cols-2 gap-3"
    >
      <div>
        <label className={label}>Type</label>
        <select name="kind" value={kind} onChange={(e) => setKind(e.target.value)} className={input}>
          {LIBRARY_KINDS.map((k) => <option key={k} value={k}>{KIND_META[k]}</option>)}
        </select>
      </div>
      <div>
        <label className={label}>Who can see it</label>
        <select name="audience" className={input} defaultValue="internal">
          <option value="internal">Instructors only</option>
          <option value="shared">Students &amp; instructors</option>
        </select>
      </div>

      <div className="sm:col-span-2">
        <label className={label}>Title *</label>
        <input name="title" required className={input} />
      </div>

      <div className="sm:col-span-2">
        <label className={label}>{isMap ? 'Link to the map' : 'Link (Drive, YouTube, or any URL)'}</label>
        <input name="url" className={input} placeholder="https://…" />
      </div>

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

      {/* Only maps are filed by place: it's how a course finds the ones that
          belong where it's running. */}
      {isMap && (
        <div>
          <label className={label}>State / country</label>
          <RegionSelect name="region" className={input} />
        </div>
      )}

      <div>
        <label className={label}>Venue</label>
        <select name="venue_id" className={input}>
          <option value="">— none —</option>
          {venues.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
        </select>
      </div>

      {/* A map has one shelf and the type already named it. */}
      {!isMap && (
        <div>
          <label className={label}>Library</label>
          <select name="bucket" className={input} defaultValue="resource">
            {BUCKET_ORDER.map((b) => <option key={b} value={b}>{BUCKET_META[b].label}</option>)}
          </select>
        </div>
      )}

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

      <div className="sm:col-span-2">
        <button className="px-4 py-2 bg-pr-red hover:bg-pr-red-dark text-white rounded text-sm font-medium transition-colors">
          Add to library
        </button>
      </div>
    </form>
  )
}
