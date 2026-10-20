'use client'

import { useState } from 'react'
import { CAPABILITY_META, CAPABILITY_ORDER } from '@/lib/capabilities'
import {
  ACCESS_META, LINK_AUDIENCE_META, KIND_META, KIND_GROUPS,
  bucketForKind, type Venue,
} from '@/lib/library'
import { createLibraryItem } from './actions'
import PlaceSelect from '@/components/PlaceSelect'
import { type SiteOption } from '@/app/admin/schedules/types'

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
}: {
  venues: Venue[]
  sites: SiteOption[]
  /** The shelf being stood on. The button has said "Add to Reference" since it
      was written and then opened a form defaulted to something else, so the
      first thing added to a shelf landed on a different one. */
  defaultBucket?: string
}) {
  const [kind, setKind] = useState('reference')
  const [bucket, setBucket] = useState(defaultBucket ?? 'resource')
  const isMap = kind === 'map'
  const isPermit = kind === 'permit'

  return (
    <form
      action={createLibraryItem}
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
          {/* Nothing added by hand needs to arrive unsaid: the person adding
              it is looking at it. */}
          {KIND_GROUPS.map((g) => (
            <optgroup key={g.label} label={g.label}>
              {g.kinds.map((k) => <option key={k} value={k}>{KIND_META[k]}</option>)}
            </optgroup>
          ))}
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

      {/* A map is about a place or it is not a map anyone can find: filed
          nowhere it is offered to no course, which is how eleven of the
          twenty-three already on the shelf ended up unfiled without anyone
          noticing. So for a map the question is required and takes either
          level — the area, or the canyon inside it. Everything else is filed
          by place only when it happens to be about one. */}

      <div className="sm:col-span-2">
        <label className={label}>{isMap ? 'Where it is * — country, state, venue or canyon' : 'Place'}</label>
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

      <div className="sm:col-span-2">
        <button className="px-4 py-2 bg-pr-red hover:bg-pr-red-dark text-white rounded text-sm font-medium transition-colors">
          Add to library
        </button>
      </div>
    </form>
  )
}
