'use client'

import { useMemo, useState, useTransition } from 'react'
import { btn } from '@/lib/ui'
import {
  clientMatches,
  clientPath,
  placeOptions,
  type ClientRow,
} from '@/lib/clients'
import { addClient, learnAlias } from '@/app/admin/clients/actions'

// Who a course is for, chosen from the client tree rather than typed.
//
// Typing a name is how the same squadron ended up spelled four ways, so there
// is no free text here: you search (names and the words people actually use),
// or browse by sector, or add a client — and adding one asks where it goes
// and checks the name against the whole tree first.
//
// When a search misses and the client is then found by browsing, the words
// that missed are saved onto it, so the next person who types them finds it.

const inputCls =
  'w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-zinc-500'
const label = 'block text-[11px] font-medium text-zinc-500 mb-1'

export default function ClientPicker({
  clients,
  defaultId = null,
  name = 'client_id',
}: {
  clients: ClientRow[]
  defaultId?: string | null
  /** The form field the chosen id is submitted as. */
  name?: string
}) {
  const [rows, setRows] = useState(clients)
  const [selected, setSelected] = useState<string | null>(defaultId)
  const [mode, setMode] = useState<'show' | 'search' | 'browse' | 'add'>(defaultId ? 'show' : 'search')
  const [query, setQuery] = useState('')
  // The last words that found nothing. Learned onto whatever is chosen next
  // by browsing, and cleared once a search finds something again.
  const [missed, setMissed] = useState('')
  const [at, setAt] = useState<string | null>(null)

  // The teams under a client, shown wherever that client is offered: a unit
  // with teams is a choice that can go one step finer, and a client picked
  // without anyone noticing that is how a course ends up on the 24 STS when
  // whoever booked it knew it was Red Team.
  const teamsOf = (id: string) =>
    rows
      .filter((r) => r.parent_id === id && !r.is_group)
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))

  const teamButtons = (id: string) => (
    <span className="flex flex-wrap gap-1">
      {teamsOf(id).map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => choose(t.id, false)}
          className="text-xs px-2 py-0.5 rounded border border-zinc-700 text-zinc-300 hover:text-white hover:border-zinc-500 hover:bg-zinc-800"
        >
          {t.name}
        </button>
      ))}
    </span>
  )

  const hits = useMemo(() => {
    if (!query.trim()) return []
    return rows
      .filter((r) => !r.is_group && clientMatches(r, query))
      .map((r) => ({ id: r.id, name: r.name, path: clientPath(rows, r.id) }))
      .sort((a, b) => a.path.localeCompare(b.path, undefined, { numeric: true }))
      .slice(0, 8)
  }, [rows, query])

  function onQuery(v: string) {
    setQuery(v)
    const found = v.trim() && rows.some((r) => !r.is_group && clientMatches(r, v))
    if (v.trim() && !found) setMissed(v.trim())
    else if (found) setMissed('')
  }

  function choose(id: string, viaBrowse: boolean) {
    if (viaBrowse && missed) void learnAlias(id, missed)
    setSelected(id)
    setMode('show')
    setQuery('')
    setMissed('')
  }

  const hidden = <input type="hidden" name={name} value={selected ?? ''} />

  if (mode === 'show' && selected) {
    const row = rows.find((r) => r.id === selected)
    const teams = row ? teamsOf(row.id) : []
    return (
      <div>
        {hidden}
        <div className="flex flex-wrap items-center gap-2 rounded border border-zinc-700 bg-zinc-800/60 px-3 py-2">
          <span className="text-sm text-white">{row?.name ?? 'Unknown client'}</span>
          {row && <span className="text-xs text-zinc-500">{clientPath(rows, row.id)}</span>}
          <span className="ml-auto flex gap-3">
            <button type="button" className={btn.quiet} onClick={() => setMode('search')}>
              Change
            </button>
            <button
              type="button"
              className={btn.quiet}
              onClick={() => {
                setSelected(null)
                setMode('search')
              }}
            >
              Clear
            </button>
          </span>
        </div>
        {/* Offered, never required: the unit is a complete answer when the
            team is not known. */}
        {teams.length > 0 && (
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <span className="text-xs text-zinc-500">Narrow to a team:</span>
            {teamButtons(row!.id)}
          </div>
        )}
      </div>
    )
  }

  if (mode === 'browse') {
    const here = at ? rows.find((r) => r.id === at) : null
    const children = rows
      .filter((r) => r.parent_id === at && (at !== null || r.is_group))
      .sort((a, b) => Number(b.is_group) - Number(a.is_group) || a.name.localeCompare(b.name, undefined, { numeric: true }))
    return (
      <div className="rounded border border-zinc-700 bg-zinc-900 p-3">
        {hidden}
        <div className="flex flex-wrap items-center gap-1 text-xs text-zinc-400 mb-2">
          <button type="button" className="hover:text-white" onClick={() => setAt(null)}>
            All sectors
          </button>
          {here &&
            clientPath(rows, here.id)
              .split(' › ')
              .map((part, i) => <span key={i}>› {part}</span>)}
          <button type="button" className={`${btn.quiet} ml-auto`} onClick={() => setMode('search')}>
            Back to search
          </button>
        </div>
        {here && !here.is_group && (
          <button type="button" className={`${btn.secondary} mb-2`} onClick={() => choose(here.id, true)}>
            Choose {here.name}
          </button>
        )}
        <ul className="max-h-64 overflow-y-auto">
          {children.map((c) => {
            const hasKids = rows.some((r) => r.parent_id === c.id)
            return (
              <li key={c.id} className="flex items-center gap-2 py-1">
                {c.is_group ? (
                  <button type="button" className="text-xs font-semibold uppercase tracking-wide text-zinc-300 hover:text-white" onClick={() => setAt(c.id)}>
                    {c.name} ›
                  </button>
                ) : (
                  <>
                    <button type="button" className="text-sm text-zinc-100 hover:text-white hover:underline" onClick={() => choose(c.id, true)}>
                      {c.name}
                    </button>
                    {hasKids && (
                      <button type="button" className="text-xs text-zinc-500 hover:text-white" onClick={() => setAt(c.id)}>
                        teams ›
                      </button>
                    )}
                  </>
                )}
              </li>
            )
          })}
          {children.length === 0 && <li className="text-xs text-zinc-500 py-1">Nothing filed here yet.</li>}
        </ul>
        <button type="button" className={`${btn.quiet} mt-2`} onClick={() => setMode('add')}>
          + Add a new client
        </button>
      </div>
    )
  }

  if (mode === 'add') {
    return (
      <div>
        {hidden}
        <NewClient
          rows={rows}
          initialName={missed || query}
          defaultParent={at}
          onCancel={() => setMode('search')}
          onUse={(id) => choose(id, false)}
          onAdded={(row) => {
            setRows((prev) => [...prev, row])
            choose(row.id, false)
          }}
        />
      </div>
    )
  }

  return (
    <div className="relative">
      {hidden}
      <input
        autoFocus={Boolean(defaultId) || undefined}
        value={query}
        onChange={(e) => onQuery(e.target.value)}
        // The picker sits inside the course's form: Enter here picks the top
        // match rather than saving the course with no client.
        onKeyDown={(e) => {
          if (e.key !== 'Enter') return
          e.preventDefault()
          if (hits[0]) choose(hits[0].id, false)
        }}
        placeholder="Search by name or what people call them"
        className={inputCls}
      />
      {query.trim() && (
        <div className="mt-1 rounded border border-zinc-700 bg-zinc-900">
          {hits.map((h) => {
            const hasTeams = teamsOf(h.id).length > 0
            return (
              <div key={h.id} className="hover:bg-zinc-800/60">
                <button
                  type="button"
                  onClick={() => choose(h.id, false)}
                  className="flex w-full items-baseline gap-2 px-3 pt-1.5 pb-1 text-left"
                >
                  <span className="text-sm text-white">{h.name}</span>
                  <span className="text-xs text-zinc-500 truncate">{h.path}</span>
                </button>
                {hasTeams && <div className="pl-6 pr-3 pb-1.5">{teamButtons(h.id)}</div>}
              </div>
            )
          })}
          {hits.length === 0 && <p className="px-3 py-2 text-xs text-zinc-500">No client called &ldquo;{query.trim()}&rdquo;.</p>}
        </div>
      )}
      <div className="mt-1.5 flex gap-4">
        <button type="button" className={btn.quiet} onClick={() => { setAt(null); setMode('browse') }}>
          Browse by sector
        </button>
        <button type="button" className={btn.quiet} onClick={() => setMode('add')}>
          + Add a new client
        </button>
        {selected && (
          <button type="button" className={btn.quiet} onClick={() => setMode('show')}>
            Cancel
          </button>
        )}
      </div>
    </div>
  )
}

/** A new client, filed where it belongs as it is made. Also used on the client
    list itself, so both doors ask the same questions. */
export function NewClient({
  rows,
  initialName = '',
  defaultParent = null,
  onCancel,
  onUse,
  onAdded,
}: {
  rows: ClientRow[]
  initialName?: string
  defaultParent?: string | null
  onCancel: () => void
  /** An existing client the duplicate check offered, chosen instead. */
  onUse?: (id: string) => void
  onAdded: (row: ClientRow) => void
}) {
  const [name, setName] = useState(initialName)
  const [aliases, setAliases] = useState('')
  const [note, setNote] = useState('')
  const [parentId, setParentId] = useState(defaultParent ?? '')
  const [similar, setSimilar] = useState<{ id: string; path: string }[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const places = useMemo(() => placeOptions(rows), [rows])

  function submit(confirmed: boolean) {
    setError(null)
    start(async () => {
      const res = await addClient({ name, aliases, note, isGroup: false, parentId: parentId || null }, confirmed)
      if (res.ok && res.id) {
        onAdded({
          id: res.id,
          parent_id: parentId,
          name: name.trim(),
          aliases: aliases.split(',').map((a) => a.trim()).filter(Boolean),
          note: note.trim() || null,
          position: 0,
          is_group: false,
          created_at: new Date().toISOString(),
        })
      } else if (!res.ok && 'similar' in res) setSimilar(res.similar)
      else if (!res.ok && 'error' in res) setError(res.error)
    })
  }

  if (similar) {
    return (
      <div className="rounded border border-amber-700/60 bg-amber-950/20 p-3 text-sm">
        <p className="text-amber-200">&ldquo;{name.trim()}&rdquo; is already in the list:</p>
        <ul className="mt-2 space-y-1">
          {similar.map((s) => (
            <li key={s.id} className="flex items-center gap-2">
              <span className="text-zinc-300">{s.path}</span>
              {onUse && (
                <button type="button" className={btn.secondary} onClick={() => onUse(s.id)}>
                  Use this one
                </button>
              )}
            </li>
          ))}
        </ul>
        <div className="mt-3 flex gap-3">
          <button type="button" className={btn.quiet} disabled={pending} onClick={() => submit(true)}>
            It&rsquo;s a different client — add it anyway
          </button>
          <button type="button" className={btn.quiet} onClick={() => setSimilar(null)}>
            Back
          </button>
        </div>
      </div>
    )
  }

  return (
    <div
      className="rounded border border-zinc-700 bg-zinc-900 p-3"
      // Inside someone else's form, Enter must not submit theirs.
      onKeyDown={(e) => {
        if (e.key === 'Enter' && (e.target as HTMLElement).tagName === 'INPUT') e.preventDefault()
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <label>
          <span className={label}>Name</span>
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} className={inputCls} />
        </label>
        <label>
          <span className={label}>Goes under</span>
          <select value={parentId} onChange={(e) => setParentId(e.target.value)} className={inputCls}>
            <option value="" disabled>
              Choose a sector, subsector or client
            </option>
            {places.map((p) => (
              <option key={p.id} value={p.id}>
                {p.path}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className={label}>Also known as (comma separated)</span>
          <input value={aliases} onChange={(e) => setAliases(e.target.value)} className={inputCls} />
        </label>
        <label>
          <span className={label}>Note</span>
          <input value={note} onChange={(e) => setNote(e.target.value)} className={inputCls} />
        </label>
      </div>
      {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
      <div className="mt-3 flex items-center gap-3">
        <button
          type="button"
          className={btn.secondary}
          disabled={pending || !name.trim() || !parentId}
          onClick={() => submit(false)}
        >
          {pending ? 'Adding…' : 'Add client'}
        </button>
        <button type="button" className={btn.quiet} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  )
}
