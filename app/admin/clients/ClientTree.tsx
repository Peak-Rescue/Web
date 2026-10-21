'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { btn } from '@/lib/ui'
import {
  buildClientTree,
  clientMatches,
  clientPath,
  subtreeIds,
  type ClientNode,
  type ClientRow,
} from '@/lib/clients'
import { addClient, deleteClient, moveClient, setSignoff, updateClient } from './actions'

type Signoff = { profileId: string; initials: string; name: string }
type Result = Awaited<ReturnType<typeof addClient>>

const inputCls =
  'bg-zinc-800 border border-zinc-700 rounded px-2.5 py-1.5 text-sm text-white focus:outline-none focus:border-zinc-500'

// One row's open form: editing it, adding under it, or moving it. Only one at
// a time across the whole tree, so two half-filled forms never compete.
type Open = { id: string | null; mode: 'edit' | 'add' | 'move' } | null

export default function ClientTree({
  rows,
  signoffs,
  me,
}: {
  rows: ClientRow[]
  signoffs: Record<string, Signoff[]>
  me: string
}) {
  const tree = useMemo(() => buildClientTree(rows), [rows])
  const [query, setQuery] = useState('')
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [open, setOpen] = useState<Open>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const router = useRouter()

  // Searching shows each hit with the branch above it, so a match always says
  // where it is filed. Collapsing is ignored while a search is on: a hit
  // hidden inside a closed branch is a search that found nothing.
  const visible = useMemo(() => {
    if (!query.trim()) return null
    const byId = new Map(rows.map((r) => [r.id, r]))
    const keep = new Set<string>()
    for (const r of rows) {
      if (!clientMatches(r, query)) continue
      for (let a: ClientRow | undefined = r; a; a = a.parent_id ? byId.get(a.parent_id) : undefined) keep.add(a.id)
    }
    return keep
  }, [rows, query])

  function run(fn: () => Promise<Result>, after?: (r: Result) => void) {
    setError(null)
    start(async () => {
      const res = await fn()
      if (res.ok) {
        setOpen(null)
        router.refresh()
      } else if ('error' in res) setError(res.error)
      after?.(res)
    })
  }

  const toggle = (id: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const renderNode = (n: ClientNode) => {
    if (visible && !visible.has(n.id)) return null
    const shut = !visible && collapsed.has(n.id)
    const ticks = signoffs[n.id] ?? []
    const mine = ticks.some((t) => t.profileId === me)
    const isBin = n.depth === 0
    const here = open?.id === n.id ? open.mode : null

    return (
      <li key={n.id}>
        <div
          className={`group flex flex-wrap items-center gap-x-3 gap-y-1 py-1.5 pr-2 rounded hover:bg-zinc-900 ${
            isBin ? 'mt-4 border-b border-zinc-800 pb-2' : ''
          }`}
          style={{ paddingLeft: `${n.depth * 24 + 4}px` }}
        >
          <button
            type="button"
            onClick={() => toggle(n.id)}
            disabled={n.children.length === 0 || Boolean(visible)}
            aria-label={shut ? `Show what is under ${n.name}` : `Hide what is under ${n.name}`}
            className="w-4 text-zinc-500 hover:text-white disabled:opacity-0"
          >
            {shut ? '▸' : '▾'}
          </button>
          <span className="min-w-0 flex-1">
            <span className={isBin ? 'text-sm font-semibold uppercase tracking-wide text-zinc-300' : 'text-sm text-zinc-100'}>
              {n.name}
            </span>
            {shut && <span className="ml-2 text-xs text-zinc-600">{n.children.length}</span>}
            {n.aliases.length > 0 && (
              <span className="ml-2 text-xs text-zinc-500">also {n.aliases.join(', ')}</span>
            )}
            {n.note && <span className="ml-2 text-xs text-amber-400/80">{n.note}</span>}
          </span>

          {!isBin && (
            <span className="flex items-center gap-1">
              {ticks.map((t) => (
                <span
                  key={t.profileId}
                  title={`Checked by ${t.name || t.initials}`}
                  className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-teal-900/60 text-teal-200"
                >
                  {t.initials}
                </span>
              ))}
              <button
                type="button"
                disabled={pending}
                onClick={() => run(() => setSignoff(n.id, !mine))}
                className={mine ? btn.agree : btn.secondary}
              >
                {mine ? '✓ Checked' : 'Check'}
              </button>
            </span>
          )}

          <span className="flex items-center gap-2 opacity-60 group-hover:opacity-100">
            <button type="button" className={btn.quiet} onClick={() => setOpen({ id: n.id, mode: 'edit' })}>
              Edit
            </button>
            <button type="button" className={btn.quiet} onClick={() => setOpen({ id: n.id, mode: 'add' })}>
              Add under
            </button>
            <button type="button" className={btn.quiet} onClick={() => setOpen({ id: n.id, mode: 'move' })}>
              Move
            </button>
            {n.children.length === 0 && (
              <button
                type="button"
                className={btn.danger}
                disabled={pending}
                onClick={() => {
                  if (confirm(`Delete ${n.name}?`)) run(() => deleteClient(n.id))
                }}
              >
                Delete
              </button>
            )}
          </span>
        </div>

        {here === 'edit' && (
          <ClientForm
            indent={n.depth * 24 + 28}
            initial={n}
            pending={pending}
            onCancel={() => setOpen(null)}
            onSave={(v) => run(() => updateClient(n.id, v))}
          />
        )}
        {here === 'move' && (
          <MoveForm
            indent={n.depth * 24 + 28}
            node={n}
            rows={rows}
            pending={pending}
            onCancel={() => setOpen(null)}
            onMove={(parentId) => run(() => moveClient(n.id, parentId))}
          />
        )}
        {!shut && (n.children.length > 0 || here === 'add') && (
          <ul>
            {n.children.map(renderNode)}
            {here === 'add' && (
              <AddForm indent={(n.depth + 1) * 24 + 28} parentId={n.id} pending={pending} run={run} onCancel={() => setOpen(null)} />
            )}
          </ul>
        )}
      </li>
    )
  }

  return (
    <div>
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search names and the words people use for them"
        className={`${inputCls} w-full`}
      />
      {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
      {visible && visible.size === 0 && <p className="mt-4 text-sm text-zinc-500">Nothing called that yet.</p>}
      <ul className="mt-2">{tree.map(renderNode)}</ul>

      <div className="mt-8">
        {open?.id === null && open.mode === 'add' ? (
          <AddForm indent={0} parentId={null} pending={pending} run={run} onCancel={() => setOpen(null)} />
        ) : (
          <button type="button" className={btn.secondary} onClick={() => setOpen({ id: null, mode: 'add' })}>
            Add a bin
          </button>
        )}
      </div>
    </div>
  )
}

function ClientForm({
  indent,
  initial,
  pending,
  onSave,
  onCancel,
  submitLabel = 'Save',
}: {
  indent: number
  initial?: Pick<ClientRow, 'name' | 'aliases' | 'note'>
  pending: boolean
  onSave: (v: { name: string; aliases: string; note: string }) => void
  onCancel: () => void
  submitLabel?: string
}) {
  const [name, setName] = useState(initial?.name ?? '')
  const [aliases, setAliases] = useState(initial?.aliases.join(', ') ?? '')
  const [note, setNote] = useState(initial?.note ?? '')
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        onSave({ name, aliases, note })
      }}
      className="flex flex-wrap items-center gap-2 py-2"
      style={{ paddingLeft: `${indent}px` }}
    >
      <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" className={`${inputCls} w-56`} />
      <input
        value={aliases}
        onChange={(e) => setAliases(e.target.value)}
        placeholder="Also called, comma separated"
        className={`${inputCls} w-72`}
      />
      <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note" className={`${inputCls} w-56`} />
      <button type="submit" disabled={pending || !name.trim()} className={btn.secondary}>
        {submitLabel}
      </button>
      <button type="button" onClick={onCancel} className={btn.quiet}>
        Cancel
      </button>
    </form>
  )
}

// Adding asks first when the name is already somewhere in the tree — the
// usual duplicate is the same unit filed under a different bin.
function AddForm({
  indent,
  parentId,
  pending,
  run,
  onCancel,
}: {
  indent: number
  parentId: string | null
  pending: boolean
  run: (fn: () => Promise<Result>, after?: (r: Result) => void) => void
  onCancel: () => void
}) {
  const [similar, setSimilar] = useState<{ paths: string[]; value: { name: string; aliases: string; note: string } } | null>(
    null
  )
  if (similar) {
    return (
      <div className="py-2 text-sm" style={{ paddingLeft: `${indent}px` }}>
        <p className="text-amber-300">
          &ldquo;{similar.value.name}&rdquo; already exists: {similar.paths.join('; ')}. Use that one instead?
        </p>
        <div className="mt-2 flex gap-2">
          <button type="button" className={btn.secondary} onClick={onCancel}>
            Yes, don&rsquo;t add it
          </button>
          <button
            type="button"
            className={btn.quiet}
            disabled={pending}
            onClick={() => run(() => addClient(parentId, similar.value, true))}
          >
            No, add it here anyway
          </button>
        </div>
      </div>
    )
  }
  return (
    <ClientForm
      indent={indent}
      pending={pending}
      submitLabel="Add"
      onCancel={onCancel}
      onSave={(value) =>
        run(
          () => addClient(parentId, value),
          (res) => {
            if (!res.ok && 'similar' in res) setSimilar({ paths: res.similar, value })
          }
        )
      }
    />
  )
}

// A plain list of places rather than dragging: a drop the browser decides to
// decline is a move that silently did not happen.
function MoveForm({
  indent,
  node,
  rows,
  pending,
  onMove,
  onCancel,
}: {
  indent: number
  node: ClientNode
  rows: ClientRow[]
  pending: boolean
  onMove: (parentId: string | null) => void
  onCancel: () => void
}) {
  const blocked = subtreeIds(rows, node.id)
  const places = rows
    .filter((r) => !blocked.has(r.id))
    .map((r) => ({ id: r.id, path: clientPath(rows, r.id) }))
    .sort((a, b) => a.path.localeCompare(b.path))
  const [to, setTo] = useState<string>(node.parent_id ?? '')
  return (
    <div className="flex flex-wrap items-center gap-2 py-2" style={{ paddingLeft: `${indent}px` }}>
      <span className="text-sm text-zinc-400">Move under</span>
      <select value={to} onChange={(e) => setTo(e.target.value)} className={`${inputCls} max-w-md`}>
        <option value="">Top level (a bin)</option>
        {places.map((p) => (
          <option key={p.id} value={p.id}>
            {p.path}
          </option>
        ))}
      </select>
      <button
        type="button"
        disabled={pending || to === (node.parent_id ?? '')}
        onClick={() => onMove(to || null)}
        className={btn.secondary}
      >
        Move
      </button>
      <button type="button" onClick={onCancel} className={btn.quiet}>
        Cancel
      </button>
    </div>
  )
}
