'use client'

import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { btn } from '@/lib/ui'
import {
  buildClientTree,
  clientMatches,
  clientPath,
  placementProblem,
  subtreeIds,
  type ClientNode,
  type ClientRow,
} from '@/lib/clients'
import { addClient, deleteClient, moveClient, setSignoff, shiftSector, updateClient } from './actions'

type Signoff = { profileId: string; initials: string; name: string }
type Result = Awaited<ReturnType<typeof addClient>>

const inputCls =
  'bg-zinc-800 border border-zinc-700 rounded px-2.5 py-1.5 text-sm text-white focus:outline-none focus:border-zinc-500'

// One open form at a time across the whole page, so two half-filled forms
// never compete. `id: null` is the add form at the top.
type Open = { id: string; mode: 'edit' | 'move' | 'delete' } | { id: null; mode: 'client' | 'sector' } | null

// Where a drag can end: on a row (file it under that row), in the unfiled
// tray, or on the strip that makes a group a sector.
type DropTarget = { kind: 'row'; id: string } | { kind: 'unfiled' } | { kind: 'top' }

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
  const sectors = tree.filter((n) => n.is_group)
  const unfiled = tree.filter((n) => !n.is_group)
  const [query, setQuery] = useState('')
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [open, setOpen] = useState<Open>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const router = useRouter()

  // ── Drag ──────────────────────────────────────────────────────────────────
  // Pointer events, not the browser's drag-and-drop: that one decides for
  // itself whether a gesture counts, and in the gear editor it declined on
  // rows nothing distinguished. A press that travels six pixels is a drag;
  // what it is over is read from the document at the pointer. Move stays on
  // every row for when a drag is not the way.
  const press = useRef<{ id: string; x: number; y: number; active: boolean } | null>(null)
  const ghost = useRef<HTMLDivElement>(null)
  const [dragId, setDragId] = useState<string | null>(null)
  const [over, setOver] = useState<string | null>(null)
  const dragged = dragId ? rows.find((r) => r.id === dragId) ?? null : null

  // Whether letting go on `t` would file the dragged row there — the same
  // rule the server applies, so the screen only lights what will work.
  const accepts = (id: string, t: DropTarget | null): boolean => {
    const node = rows.find((r) => r.id === id)
    if (!node || !t) return false
    if (t.kind === 'unfiled') return !node.is_group && node.parent_id !== null
    if (t.kind === 'top') return node.is_group && node.parent_id !== null
    if (t.id === id || t.id === node.parent_id) return false
    return placementProblem(rows, id, t.id) === null
  }
  const acceptsRef = useRef(accepts)
  useEffect(() => {
    acceptsRef.current = accepts
  })

  useEffect(() => {
    function targetAt(x: number, y: number): DropTarget | null {
      const el = document.elementFromPoint(x, y) as HTMLElement | null
      const row = el?.closest('[data-client]') as HTMLElement | null
      if (row) return { kind: 'row', id: row.dataset.client as string }
      const zone = el?.closest('[data-drop]') as HTMLElement | null
      if (zone) return { kind: zone.dataset.drop as 'unfiled' | 'top' }
      return null
    }
    const key = (t: DropTarget | null) => (t ? (t.kind === 'row' ? t.id : t.kind) : null)

    function move(ev: PointerEvent) {
      const p = press.current
      if (!p) return
      if (!p.active) {
        if (Math.abs(ev.clientX - p.x) + Math.abs(ev.clientY - p.y) < 6) return
        p.active = true
        setDragId(p.id)
        setOpen(null)
      }
      ev.preventDefault()
      if (ghost.current) ghost.current.style.transform = `translate(${ev.clientX + 14}px, ${ev.clientY + 10}px)`
      // A long list scrolls under the pointer when it nears either edge.
      if (ev.clientY < 70) window.scrollBy(0, -14)
      else if (ev.clientY > window.innerHeight - 70) window.scrollBy(0, 14)
      const t = targetAt(ev.clientX, ev.clientY)
      const k = acceptsRef.current(p.id, t) ? key(t) : null
      setOver((prev) => (prev === k ? prev : k))
    }
    function up(ev: PointerEvent) {
      const p = press.current
      press.current = null
      if (!p?.active) return
      setDragId(null)
      setOver(null)
      const t = targetAt(ev.clientX, ev.clientY)
      if (!acceptsRef.current(p.id, t)) return
      const parentId = t && t.kind === 'row' ? t.id : null
      setError(null)
      start(async () => {
        const res = await moveClient(p.id, parentId)
        if (res.ok) router.refresh()
        else if ('error' in res) setError(res.error)
      })
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
    }
  }, [router])

  function onRowPointerDown(id: string, ev: React.PointerEvent) {
    if (ev.button !== 0) return
    // On a touch screen a press on the row is a scroll; only the handle drags.
    if (ev.pointerType === 'touch' && !(ev.target as HTMLElement).closest('[data-handle]')) return
    if ((ev.target as HTMLElement).closest('input, textarea, button, a, select')) return
    press.current = { id, x: ev.clientX, y: ev.clientY, active: false }
  }

  // ── Search ────────────────────────────────────────────────────────────────
  // Each hit shows with the branch above it, so a match always says where it
  // is filed. Collapsing is ignored while a search is on: a hit hidden inside
  // a closed branch is a search that found nothing.
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
    const sector = n.is_group && n.parent_id === null
    const subsector = n.is_group && n.parent_id !== null
    const here = open?.id === n.id ? open.mode : null
    const isDragged = dragId === n.id
    const isOver = over === n.id

    return (
      <li key={n.id}>
        <div
          data-client={n.id}
          onPointerDown={(e) => onRowPointerDown(n.id, e)}
          className={`group flex flex-wrap items-center gap-x-3 gap-y-1 py-1.5 pr-2 rounded transition-colors ${
            dragId ? 'cursor-grabbing' : 'cursor-grab hover:bg-zinc-900'
          } ${sector ? 'mt-4 border-b border-zinc-800 pb-2' : ''} ${isDragged ? 'opacity-40' : ''} ${
            isOver ? 'bg-teal-900/40 ring-1 ring-teal-500' : ''
          }`}
          style={{ paddingLeft: `${n.depth * 24 + 4}px` }}
        >
          <span data-handle className="w-3 text-zinc-600 select-none touch-none" aria-hidden>
            ⠿
          </span>
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
            <span
              className={
                sector
                  ? 'text-sm font-semibold uppercase tracking-wide text-zinc-300'
                  : subsector
                    ? 'text-xs font-semibold uppercase tracking-wide text-zinc-400'
                    : 'text-sm text-zinc-100'
              }
            >
              {n.name}
            </span>
            {shut && <span className="ml-2 text-xs text-zinc-600">{n.children.length}</span>}
            {n.aliases.length > 0 && <span className="ml-2 text-xs text-zinc-500">also {n.aliases.join(', ')}</span>}
            {n.note && <span className="ml-2 text-xs text-amber-400/80">{n.note}</span>}
          </span>

          {!n.is_group && (
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
            <button type="button" className={btn.quiet} onClick={() => setOpen({ id: n.id, mode: 'move' })}>
              Move
            </button>
            {sector && (
              <>
                <button type="button" className={btn.quiet} disabled={pending} title="Move this sector up" onClick={() => run(() => shiftSector(n.id, -1))}>
                  ↑
                </button>
                <button type="button" className={btn.quiet} disabled={pending} title="Move this sector down" onClick={() => run(() => shiftSector(n.id, 1))}>
                  ↓
                </button>
              </>
            )}
            <button
              type="button"
              className={btn.danger}
              disabled={pending}
              onClick={() => {
                if (n.children.length > 0) setOpen({ id: n.id, mode: 'delete' })
                else if (confirm(`Delete ${n.name}?`)) run(() => deleteClient(n.id))
              }}
            >
              Delete
            </button>
          </span>
        </div>

        {here === 'edit' && (
          <ClientForm
            indent={n.depth * 24 + 28}
            initial={n}
            group={n.is_group}
            pending={pending}
            onCancel={() => setOpen(null)}
            onSave={(v) => run(() => updateClient(n.id, v))}
          />
        )}
        {here === 'move' && (
          <PlaceForm
            indent={n.depth * 24 + 28}
            node={n}
            rows={rows}
            pending={pending}
            onCancel={() => setOpen(null)}
            onPick={(parentId) => run(() => moveClient(n.id, parentId))}
          />
        )}
        {here === 'delete' && (
          <PlaceForm
            indent={n.depth * 24 + 28}
            node={n}
            rows={rows}
            pending={pending}
            deleting
            onCancel={() => setOpen(null)}
            onPick={(parentId) => run(() => deleteClient(n.id, parentId))}
          />
        )}
        {!shut && n.children.length > 0 && <ul>{n.children.map(renderNode)}</ul>}
      </li>
    )
  }

  const showUnfiled = unfiled.length > 0 || (dragged && !dragged.is_group && dragged.parent_id !== null)

  return (
    <div className={dragId ? 'select-none' : ''}>
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search names and the words people use for them"
          className={`${inputCls} flex-1 min-w-64`}
        />
        <button type="button" className={btn.secondary} onClick={() => setOpen({ id: null, mode: 'client' })}>
          Add a client
        </button>
        <button type="button" className={btn.secondary} onClick={() => setOpen({ id: null, mode: 'sector' })}>
          Add a sector
        </button>
      </div>
      {open?.id === null && (
        <AddForm key={open.mode} group={open.mode === 'sector'} pending={pending} run={run} onCancel={() => setOpen(null)} />
      )}
      {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
      {visible && visible.size === 0 && <p className="mt-4 text-sm text-zinc-500">Nothing called that yet.</p>}

      {showUnfiled && (!visible || unfiled.some((n) => visible.has(n.id))) && (
        <section
          data-drop="unfiled"
          className={`mt-5 rounded-lg border border-dashed p-3 transition-colors ${
            over === 'unfiled' ? 'border-teal-500 bg-teal-900/30' : 'border-zinc-700'
          }`}
        >
          <h2 className="text-xs font-semibold uppercase tracking-wide text-amber-300/90">Not filed yet</h2>
          <p className="text-xs text-zinc-500 mt-0.5">Drag each one onto the sector, subsector or client it belongs under.</p>
          {unfiled.length > 0 && <ul className="mt-1">{unfiled.map(renderNode)}</ul>}
        </section>
      )}

      <ul className="mt-2">{sectors.map(renderNode)}</ul>

      {dragged?.is_group && dragged.parent_id !== null && (
        <div
          data-drop="top"
          className={`mt-6 rounded-lg border border-dashed p-4 text-center text-sm transition-colors ${
            over === 'top' ? 'border-teal-500 bg-teal-900/30 text-teal-200' : 'border-zinc-700 text-zinc-500'
          }`}
        >
          Drop here to make it a sector of its own
        </div>
      )}

      {/* Follows the pointer while dragging; positioned from the move handler
          rather than from state, so the list does not re-render on every pixel. */}
      <div
        ref={ghost}
        className={`fixed left-0 top-0 z-50 pointer-events-none rounded bg-zinc-800 border border-zinc-600 px-2.5 py-1 text-sm text-white shadow-lg ${
          dragged ? '' : 'hidden'
        }`}
      >
        {dragged?.name}
      </div>
    </div>
  )
}

function ClientForm({
  indent,
  initial,
  group,
  pending,
  onSave,
  onCancel,
  submitLabel = 'Save',
}: {
  indent: number
  initial?: Pick<ClientRow, 'name' | 'aliases' | 'note'>
  group: boolean
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
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder={group ? 'Sector name' : 'Name'}
        className={`${inputCls} w-56`}
      />
      {/* Search words belong to clients: nobody books a course "for Industrial". */}
      {!group && (
        <input
          value={aliases}
          onChange={(e) => setAliases(e.target.value)}
          placeholder="Also called, comma separated"
          className={`${inputCls} w-72`}
        />
      )}
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

// A new client asks first when its name is already somewhere in the tree —
// the usual duplicate is the same unit filed under a different sector.
function AddForm({
  group,
  pending,
  run,
  onCancel,
}: {
  group: boolean
  pending: boolean
  run: (fn: () => Promise<Result>, after?: (r: Result) => void) => void
  onCancel: () => void
}) {
  const [similar, setSimilar] = useState<{ paths: string[]; value: { name: string; aliases: string; note: string } } | null>(
    null
  )
  if (similar) {
    return (
      <div className="py-2 text-sm">
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
            onClick={() => run(() => addClient({ ...similar.value, isGroup: false }, true))}
          >
            No, add it anyway
          </button>
        </div>
      </div>
    )
  }
  return (
    <ClientForm
      indent={0}
      group={group}
      pending={pending}
      submitLabel={group ? 'Add sector' : 'Add client'}
      onCancel={onCancel}
      onSave={(value) =>
        run(
          () => addClient({ ...value, isGroup: group }),
          (res) => {
            if (!res.ok && 'similar' in res) setSimilar({ paths: res.similar, value })
          }
        )
      }
    />
  )
}

const CHOOSE = '__choose'

// The no-drag way to file something, and the way Delete says where the
// contents go. Lists only the places the rules allow.
function PlaceForm({
  indent,
  node,
  rows,
  pending,
  deleting = false,
  onPick,
  onCancel,
}: {
  indent: number
  node: ClientNode
  rows: ClientRow[]
  pending: boolean
  deleting?: boolean
  onPick: (parentId: string | null) => void
  onCancel: () => void
}) {
  const blocked = subtreeIds(rows, node.id)
  // When deleting, it is the contents that move, so a place is offered if it
  // can take every one of them.
  const movers = deleting ? rows.filter((r) => r.parent_id === node.id) : [node]
  const fits = (parentId: string | null) => movers.every((m) => placementProblem(rows, m.id, parentId) === null)
  const places = rows
    .filter((r) => !blocked.has(r.id) && fits(r.id))
    .map((r) => ({ id: r.id, path: clientPath(rows, r.id) }))
    .sort((a, b) => a.path.localeCompare(b.path, undefined, { numeric: true }))
  const topLabel = movers.every((m) => m.is_group)
    ? 'Top level (a sector)'
    : movers.every((m) => !m.is_group)
      ? 'Not filed yet'
      : 'Top level / not filed yet'
  // Deleting starts with nothing chosen: the obvious default for a sector is
  // "top level", which would unfile every client in it.
  const [to, setTo] = useState<string>(deleting ? CHOOSE : node.parent_id ?? '')
  return (
    <div className="flex flex-wrap items-center gap-2 py-2" style={{ paddingLeft: `${indent}px` }}>
      <span className="text-sm text-zinc-400">
        {deleting
          ? `Delete ${node.name} and move its ${movers.length} ${movers.length === 1 ? 'entry' : 'entries'} to`
          : 'Move under'}
      </span>
      <select value={to} onChange={(e) => setTo(e.target.value)} className={`${inputCls} max-w-md`}>
        {deleting && (
          <option value={CHOOSE} disabled>
            Choose where they go
          </option>
        )}
        <option value="">{topLabel}</option>
        {places.map((p) => (
          <option key={p.id} value={p.id}>
            {p.path}
          </option>
        ))}
      </select>
      <button
        type="button"
        disabled={pending || to === CHOOSE || (!deleting && to === (node.parent_id ?? ''))}
        onClick={() => onPick(to || null)}
        className={deleting ? btn.danger : btn.secondary}
      >
        {deleting ? 'Delete' : 'Move'}
      </button>
      <button type="button" onClick={onCancel} className={btn.quiet}>
        Cancel
      </button>
    </div>
  )
}
