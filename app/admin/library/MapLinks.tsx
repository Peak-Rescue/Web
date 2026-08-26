'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ACCESS_META, LINK_AUDIENCE_META, type MapLink } from '@/lib/library'
import { removeMapLink, setMapLink } from './actions'

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
  const [access, setAccess] = useState<MapLink['access']>('read')
  const [audience, setAudience] = useState<MapLink['audience']>('students')

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
          {links.map((l) => (
            <div key={l.id} className="flex items-center gap-3 px-3 py-2">
              <span
                className={`text-[10px] px-1.5 py-0.5 rounded shrink-0 ${
                  l.audience === 'students'
                    ? 'bg-teal-950/60 text-teal-300'
                    : 'bg-amber-950/60 text-amber-400'
                }`}
              >
                {LINK_AUDIENCE_META[l.audience]}
              </span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 shrink-0">
                {ACCESS_META[l.access]}
              </span>
              <a
                href={l.url}
                target="_blank"
                rel="noreferrer"
                className="text-xs text-zinc-400 hover:text-zinc-200 truncate min-w-0"
              >
                {l.url}
              </a>
              <button
                onClick={() => run(() => removeMapLink(l.id))}
                disabled={busy}
                className="ml-auto shrink-0 text-xs text-zinc-500 hover:text-pr-red-light disabled:opacity-40 transition-colors"
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-end gap-2">
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://sartopo.com/m/…"
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
          onClick={() => run(async () => { await setMapLink(itemId, { url, access, audience }); setUrl('') })}
          disabled={busy || !url.trim()}
          className="px-3 py-1.5 rounded text-xs font-medium bg-zinc-700 hover:bg-zinc-600 text-zinc-200 disabled:opacity-40 transition-colors"
        >
          {taken ? 'Replace' : 'Add link'}
        </button>
      </div>
      {taken && (
        <p className="text-[11px] text-amber-400 mt-1.5">
          There is already a {ACCESS_META[access].toLowerCase()} link for {LINK_AUDIENCE_META[audience].toLowerCase()} — adding this replaces it.
        </p>
      )}
    </div>
  )
}
