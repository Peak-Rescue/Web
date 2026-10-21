'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ACCESS_META, LINK_AUDIENCE_META, type MapLink } from '@/lib/library'
import { removeMapLink, setMapLink, updateMapLink } from './actions'
import { STUDENTS, INSTRUCTORS } from '@/components/AudiencePills'

// The ways into one map.
//
// Two questions per link and no third: what you can do with it once it opens,
// and who may be handed it. They are asked separately because they are
// separate — the old shape assumed read-only meant students and editable meant
// instructors, which is usually true and not always, and a form that assumes
// it is a form that won't let you say the other thing.
//
// No name on a link. The same map at a different access is still that map, and
// a genuinely different map belongs in its own library entry.

const ACCESSES = ['read', 'edit'] as const
const AUDIENCES = ['students', 'instructors'] as const

const input = 'w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-sm focus:outline-none focus:border-zinc-500'


export default function MapLinks({ itemId, links }: { itemId: string; links: MapLink[] }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [url, setUrl] = useState('')
  // The blank row is behind a button. Shown always, its two dropdowns sat
  // there reading as a description of the map — "Read-only / Students" beside
  // a map that is neither — because nothing distinguished a row describing a
  // link that exists from a row waiting for one that does not. The fix is not
  // to label the empty row better; it is for there not to be one until it is
  // asked for.
  const [adding, setAdding] = useState(false)
  const [access, setAccess] = useState<MapLink['access']>('read')
  const [audience, setAudience] = useState<MapLink['audience']>('students')

  /** Unwraps a refusal into the error line rather than throwing it. */
  async function save(p: Promise<{ error: string } | void>) {
    const r = await p
    if (r && 'error' in r) throw new Error(r.error)
  }

  async function run(fn: () => Promise<void>) {
    setBusy(true)
    setError(null)
    try {
      await fn()
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That didn’t work')
    } finally {
      setBusy(false)
    }
  }

  // Taken already, so adding it would silently replace what's there.
  const taken = links.some((l) => l.access === access && l.audience === audience)

  return (
    <div>
      <p className="text-[11px] text-zinc-500 mb-1.5">Links to this map</p>

      {error && <p className="text-xs text-pr-red mb-2">{error}</p>}

      {links.length > 0 && (
        <div className="bg-zinc-950/40 border border-zinc-800 rounded divide-y divide-zinc-800 mb-2">
          {/* Editable, because this is the edit form. A link that can only be
              removed and retyped is a link you retype to fix a typo, and the
              two dropdowns beside it were the only way to say what it is —
              set once when it was added and then frozen. */}
          {links.map((l) => (
            <div key={l.id} className="flex items-center gap-2 px-3 py-2">
              <select
                value={l.audience}
                disabled={busy}
                onChange={(e) => run(() => save(updateMapLink(l.id, { audience: e.target.value as MapLink['audience'] })))}
                className={`text-[11px] rounded px-1.5 py-1 border border-transparent focus:outline-none focus:border-zinc-600 shrink-0 ${
                  l.audience === 'students' ? STUDENTS : INSTRUCTORS
                }`}
              >
                {AUDIENCES.map((a) => <option key={a} value={a}>{LINK_AUDIENCE_META[a]}</option>)}
              </select>
              <select
                value={l.access}
                disabled={busy}
                onChange={(e) => run(() => save(updateMapLink(l.id, { access: e.target.value as MapLink['access'] })))}
                className="text-[11px] rounded px-1.5 py-1 bg-zinc-800 text-zinc-400 border border-transparent focus:outline-none focus:border-zinc-600 shrink-0"
              >
                {ACCESSES.map((a) => <option key={a} value={a}>{ACCESS_META[a]}</option>)}
              </select>
              {/* Uncontrolled and saved on blur: a controlled box here would
                  round-trip every keystroke. */}
              <input
                defaultValue={l.url}
                disabled={busy}
                spellCheck={false}
                onBlur={(e) => {
                  if (e.target.value.trim() !== l.url) run(() => save(updateMapLink(l.id, { url: e.target.value })))
                }}
                className="flex-1 min-w-0 bg-transparent border border-transparent hover:border-zinc-800 focus:border-zinc-600 rounded px-1.5 py-1 text-xs text-zinc-400 focus:text-zinc-200 focus:outline-none"
              />
              <a
                href={l.url}
                target="_blank"
                rel="noreferrer"
                title="Open this map"
                className="shrink-0 text-xs text-zinc-600 hover:text-zinc-300 transition-colors"
              >
                ↗
              </a>
              {/* The URL is on screen, so this is recoverable by pasting it
                  back — but it is still a destructive first click, and the
                  access and audience beside it are not written anywhere the
                  person could read them back off afterwards. */}
              <button
                onClick={() => {
                  if (confirm(`Remove this ${LINK_AUDIENCE_META[l.audience].toLowerCase()} link from the map?\n\n${l.url}`)) {
                    run(() => removeMapLink(l.id))
                  }
                }}
                disabled={busy}
                className="ml-auto shrink-0 text-xs text-zinc-500 hover:text-pr-red-light disabled:opacity-40 transition-colors"
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      )}

      {!adding ? (
        <button
          onClick={() => setAdding(true)}
          className="text-[11px] text-zinc-500 hover:text-white transition-colors"
        >
          + Add a link
        </button>
      ) : (
      <div className="flex flex-wrap items-end gap-2">
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://caltopo.com/m/…"
          autoFocus
          spellCheck={false}
          className={`${input} flex-1 min-w-[14rem]`}
        />
        <select
          value={access}
          onChange={(e) => setAccess(e.target.value as MapLink['access'])}
          className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-sm text-zinc-300 focus:outline-none focus:border-zinc-500"
        >
          {ACCESSES.map((a) => <option key={a} value={a}>{ACCESS_META[a]}</option>)}
        </select>
        <select
          value={audience}
          onChange={(e) => setAudience(e.target.value as MapLink['audience'])}
          className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-sm text-zinc-300 focus:outline-none focus:border-zinc-500"
        >
          {AUDIENCES.map((a) => <option key={a} value={a}>{LINK_AUDIENCE_META[a]}</option>)}
        </select>
        <button
          onClick={() => run(async () => {
            await setMapLink(itemId, { url, access, audience })
            setUrl('')
            setAdding(false)
          })}
          disabled={busy || !url.trim()}
          className="px-3 py-1.5 rounded text-xs font-medium bg-zinc-700 hover:bg-zinc-600 text-zinc-200 disabled:opacity-40 transition-colors"
        >
          {taken ? 'Replace' : 'Add link'}
        </button>
        <button
          onClick={() => { setAdding(false); setUrl('') }}
          disabled={busy}
          className="text-[11px] text-zinc-600 hover:text-zinc-300 transition-colors"
        >
          Cancel
        </button>
      </div>
      )}
      {adding && taken && (
        <p className="text-[11px] text-amber-400 mt-1.5">
          There is already a {ACCESS_META[access].toLowerCase()} link for {LINK_AUDIENCE_META[audience].toLowerCase()} — adding this replaces it.
        </p>
      )}
    </div>
  )
}
