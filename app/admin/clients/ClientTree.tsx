'use client'

import ContactBook from '@/components/ContactBook'
import { type BookContact } from '@/app/admin/contacts/actions'
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
import { addClient, deleteClient, mergeClient, moveClient, saveClientNote, setSignoff, shiftSector, updateClient } from './actions'
import { NewClient } from '@/components/ClientPicker'

type Signoff = { profileId: string; initials: string; name: string }
type Result = Awaited<ReturnType<typeof addClient>>

const inputCls =
  'bg-zinc-800 border border-zinc-700 rounded px-2.5 py-1.5 text-sm text-white focus:outline-none focus:border-zinc-500'

// One open form at a time across the whole page, so two half-filled forms
// never compete. `id: null` is the add form at the top.
type Open = { id: string; mode: 'edit' | 'delete' | 'merge' | 'people' } | { id: null; mode: 'client' | 'sector' } | null

// Where a drag can end: on a row (file it under that row), in the unfiled
// tray, or on the strip that makes a group a sector.
type DropTarget = { kind: 'row'; id: string } | { kind: 'unfiled' } | { kind: 'top' }

export default function ClientTree({
  rows,
  signoffs,
  me,
  courseCounts,
  contactsByOwner,
}: {
  rows: ClientRow[]
  signoffs: Record<string, Signoff[]>
  me: string
  /** The people each client is known for, keyed `client:<id>` (267). */
  contactsByOwner?: Record<string, BookContact[]>
  /** How many courses point at each client. A client with courses is merged,
      never deleted, and the count says which is the real one of two. */
  courseCounts: Record<string, number>
}) {
  // Clients added in the last month carry a marker, so each new one gets seen
  // by an admin — the moment a duplicate is cheapest to catch.
  const [newSince] = useState(() => Date.now() - 30 * 86_400_000)
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
  // what it is over is read from the document at the pointer. On a touch
  // screen the handle is what drags, so a row press can still scroll.
  const press = useRef<{ id: string; x: number; y: number; active: boolean } | null>(null)
  // A drag that ends over the row it started on can still fire a click on
  // the name; this keeps that click from opening the row.
  const draggedJustNow = useRef(false)
  const ghost = useRef<HTMLDivElement>(null)
  const [dragId, setDragId] = useState<string | null>(null)
  const [over, setOver] = useState<string | null>(null)
  const dragged = dragId ? rows.find((r) => r.id === dragId) ?? null : null

  // Whether letting go on `t` would file the dragged row there — the same
  // rule the server applies, so the screen only lights what will work.
  const accepts = (id: string, t: DropTarget | null): boolean => {
    const node = rows.find((r) => r.id === id)
    if (!node || !t) return false
    // A client always lives in a sector now; the tray only holds the few that
    // predate that rule, and nothing is dropped back into it.
    if (t.kind === 'unfiled') return false
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
      draggedJustNow.current = true
      setTimeout(() => {
        draggedJustNow.current = false
      }, 0)
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

  // A click on a name, unless that press was the start of a drag.
  function openFromName(n: ClientNode) {
    if (draggedJustNow.current) return
    if (n.is_group) toggle(n.id)
    else setOpen(open?.id === n.id && open.mode === 'people' ? null : { id: n.id, mode: 'people' })
  }

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
            {/* The name is the way in: a client opens to its note and its
                people, a sector to what is filed under it. A press that turns
                into a drag is not a click, so dragging by the name still
                works. */}
            <span
              role="button"
              tabIndex={0}
              aria-expanded={n.is_group ? !shut : here === 'people'}
              onClick={() => openFromName(n)}
              onKeyDown={(e) => {
                if (e.key !== 'Enter' && e.key !== ' ') return
                e.preventDefault()
                openFromName(n)
              }}
              className={`cursor-pointer hover:underline decoration-zinc-600 underline-offset-4 ${
                sector
                  ? 'text-sm font-semibold uppercase tracking-wide text-zinc-300'
                  : subsector
                    ? 'text-xs font-semibold uppercase tracking-wide text-zinc-400'
                    : 'text-sm text-zinc-100'
              }`}
            >
              {n.name}
            </span>
            {shut && <span className="ml-2 text-xs text-zinc-600">{n.children.length}</span>}
            {n.created_at && Date.parse(n.created_at) > newSince && (
              <span className="ml-2 text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded bg-sky-900/60 text-sky-200">
                New
              </span>
            )}
            {!n.is_group && (courseCounts[n.id] ?? 0) > 0 && (
              <span className="ml-2 text-xs text-zinc-600">
                {courseCounts[n.id]} {courseCounts[n.id] === 1 ? 'course' : 'courses'}
              </span>
            )}
            {!n.is_group && (n.contacts ?? []).length > 0 && (
              <span className="ml-2 text-xs text-zinc-600">
                {(n.contacts ?? []).length} {(n.contacts ?? []).length === 1 ? 'person' : 'people'}
              </span>
            )}
            {n.aliases.length > 0 && <span className="ml-2 text-xs text-zinc-500">also {n.aliases.join(', ')}</span>}
            {/* The first line only: the whole note is in the panel the name
                opens, and a long one would push the row's buttons off it. */}
            {n.note && (
              <span className="ml-2 text-xs text-amber-400/80">
                {n.note.split('\n')[0].slice(0, 80)}
                {n.note.length > Math.min(80, n.note.split('\n')[0].length) ? '…' : ''}
              </span>
            )}
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
                if (!n.is_group && (courseCounts[n.id] ?? 0) > 0) setOpen({ id: n.id, mode: 'merge' })
                else if (n.children.length > 0) setOpen({ id: n.id, mode: 'delete' })
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
        {/* Their people, where their people live. A POC filed from a course
            had nowhere to be read or corrected — the next course for the same
            client started from a blank list. Opened by clicking the name. */}
        {here === 'people' && (
          <div style={{ marginLeft: n.depth * 24 + 28 }} className="my-2 p-3 rounded border border-zinc-800 bg-zinc-900/60">
            <ClientNotes id={n.id} initial={n.note ?? ''} />
            <ContactBook
              scope={{ clientId: n.id }}
              contacts={contactsByOwner?.[`client:${n.id}`] ?? []}
              rolePlaceholder="Booking, safety, billing…"
            />
          </div>
        )}
        {here === 'delete' && (
          <RehomeForm
            indent={n.depth * 24 + 28}
            node={n}
            rows={rows}
            pending={pending}
            onCancel={() => setOpen(null)}
            onPick={(parentId) => run(() => deleteClient(n.id, parentId))}
          />
        )}
        {here === 'merge' && (
          <MergeForm
            indent={n.depth * 24 + 28}
            node={n}
            rows={rows}
            courses={courseCounts[n.id] ?? 0}
            pending={pending}
            onCancel={() => setOpen(null)}
            onMerge={(intoId) => run(() => mergeClient(n.id, intoId))}
          />
        )}
        {!shut && n.children.length > 0 && <ul>{n.children.map(renderNode)}</ul>}
      </li>
    )
  }

  const showUnfiled = unfiled.length > 0

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
      {open?.id === null && open.mode === 'client' && (
        <div className="mt-3">
          <NewClient
            rows={rows}
            onCancel={() => setOpen(null)}
            onUse={() => setOpen(null)}
            onAdded={() => {
              setOpen(null)
              router.refresh()
            }}
          />
        </div>
      )}
      {open?.id === null && open.mode === 'sector' && (
        <ClientForm
          indent={0}
          group
          pending={pending}
          submitLabel="Add sector"
          onCancel={() => setOpen(null)}
          onSave={(v) => run(() => addClient({ ...v, note: v.note ?? '', isGroup: true, parentId: null }))}
        />
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
          <p className="text-xs text-zinc-500 mt-0.5">Added before clients had to be filed. Drag each one to where it belongs.</p>
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
  onSave: (v: { name: string; aliases: string; note?: string }) => void
  onCancel: () => void
  submitLabel?: string
}) {
  const [name, setName] = useState(initial?.name ?? '')
  const [aliases, setAliases] = useState(initial?.aliases.join(', ') ?? '')
  const [note, setNote] = useState(initial?.note ?? '')
  // Labels above the boxes rather than greyed-out text inside them: a hint
  // that vanishes once the box is filled leaves a row of three unlabelled
  // values, and which one is the note is exactly what you then can't tell.
  const label = 'block text-[11px] font-medium text-zinc-500 mb-1'
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        // A client's note lives in its panel; only a sector's is edited here.
        onSave({ name, aliases, ...(group ? { note } : {}) })
      }}
      className="flex flex-wrap items-end gap-3 py-2"
      style={{ paddingLeft: `${indent}px` }}
    >
      <label className="w-56">
        <span className={label}>{group ? 'Sector name' : 'Name'}</span>
        <input autoFocus value={name} onChange={(e) => setName(e.target.value)} className={`${inputCls} w-full`} />
      </label>
      {/* Search words belong to clients: nobody books a course "for Industrial". */}
      {!group && (
        <label className="flex-1 min-w-64">
          <span className={label}>Also known as (comma separated)</span>
          <input value={aliases} onChange={(e) => setAliases(e.target.value)} className={`${inputCls} w-full`} />
        </label>
      )}
      {group && (
        <label className="w-56">
          <span className={label}>Note</span>
          <input value={note} onChange={(e) => setNote(e.target.value)} className={`${inputCls} w-full`} />
        </label>
      )}
      <span className="flex items-center gap-2 pb-0.5">
        <button type="submit" disabled={pending || !name.trim()} className={btn.secondary}>
          {submitLabel}
        </button>
        <button type="button" onClick={onCancel} className={btn.quiet}>
          Cancel
        </button>
      </span>
    </form>
  )
}

// Folding a duplicate into the real client. Offered instead of Delete for a
// client that has courses: its courses, teams and names all move across.
function MergeForm({
  indent,
  node,
  rows,
  courses,
  pending,
  onMerge,
  onCancel,
}: {
  indent: number
  node: ClientNode
  rows: ClientRow[]
  courses: number
  pending: boolean
  onMerge: (intoId: string) => void
  onCancel: () => void
}) {
  const blocked = subtreeIds(rows, node.id)
  const targets = rows
    .filter((r) => !r.is_group && !blocked.has(r.id))
    .map((r) => ({ id: r.id, path: clientPath(rows, r.id) }))
    .sort((a, b) => a.path.localeCompare(b.path, undefined, { numeric: true }))
  const [into, setInto] = useState('')
  return (
    <div className="flex flex-wrap items-center gap-2 py-2" style={{ paddingLeft: `${indent}px` }}>
      <span className="text-sm text-zinc-400">
        {node.name} has {courses} {courses === 1 ? 'course' : 'courses'}. Merge it into
      </span>
      <select value={into} onChange={(e) => setInto(e.target.value)} className={`${inputCls} max-w-md`}>
        <option value="" disabled>
          Choose the client it duplicates
        </option>
        {targets.map((t) => (
          <option key={t.id} value={t.id}>
            {t.path}
          </option>
        ))}
      </select>
      <button type="button" disabled={pending || !into} onClick={() => onMerge(into)} className={btn.danger}>
        Merge
      </button>
      <button type="button" onClick={onCancel} className={btn.quiet}>
        Cancel
      </button>
    </div>
  )
}

const CHOOSE = '__choose'

// Where Delete sends what was filed under the thing it removes. Offers only
// places that can take every one of them.
function RehomeForm({
  indent,
  node,
  rows,
  pending,
  onPick,
  onCancel,
}: {
  indent: number
  node: ClientNode
  rows: ClientRow[]
  pending: boolean
  onPick: (parentId: string | null) => void
  onCancel: () => void
}) {
  const blocked = subtreeIds(rows, node.id)
  const movers = rows.filter((r) => r.parent_id === node.id)
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
  // Starts with nothing chosen: the obvious default for a sector is "top
  // level", which would unfile every client in it.
  const [to, setTo] = useState<string>(CHOOSE)
  return (
    <div className="flex flex-wrap items-center gap-2 py-2" style={{ paddingLeft: `${indent}px` }}>
      <span className="text-sm text-zinc-400">
        Delete {node.name} and move its {movers.length} {movers.length === 1 ? 'entry' : 'entries'} to
      </span>
      <select value={to} onChange={(e) => setTo(e.target.value)} className={`${inputCls} max-w-md`}>
        <option value={CHOOSE} disabled>
          Choose where they go
        </option>
        <option value="">{topLabel}</option>
        {places.map((p) => (
          <option key={p.id} value={p.id}>
            {p.path}
          </option>
        ))}
      </select>
      <button type="button" disabled={pending || to === CHOOSE} onClick={() => onPick(to || null)} className={btn.danger}>
        Delete
      </button>
      <button type="button" onClick={onCancel} className={btn.quiet}>
        Cancel
      </button>
    </div>
  )
}

// A client's notes, in the panel its name opens. A box that grows with what is
// in it, saved as you type — notes run long, and a Save button is a thing to
// forget. It keeps its own text once open: every save refreshes the page, and
// a box rebuilt from the saved copy mid-sentence would eat what was typed
// while the save was in the air.
function ClientNotes({ id, initial }: { id: string; initial: string }) {
  const [text, setText] = useState(initial)
  const [state, setState] = useState<'idle' | 'pending' | 'saving' | 'saved' | 'error'>('idle')
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const box = useRef<HTMLTextAreaElement>(null)
  const last = useRef(initial)

  // Tall enough for everything in it, never a scrollbar inside a scrollbar.
  useEffect(() => {
    const el = box.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.max(el.scrollHeight, 96)}px`
  }, [text])

  async function save(value: string) {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    if (value === last.current) return setState((s) => (s === 'pending' ? 'idle' : s))
    setState('saving')
    const res = await saveClientNote(id, value)
    if (res.ok) {
      last.current = value
      setState('saved')
    } else setState('error')
  }

  return (
    <div className="mb-3">
      <div className="flex items-baseline justify-between mb-1">
        <span className="text-[11px] font-medium text-zinc-500">Notes</span>
        <span className={`text-[11px] ${state === 'error' ? 'text-red-400' : state === 'saved' ? 'text-teal-400' : 'text-zinc-600'}`}>
          {state === 'saving' ? 'Saving…' : state === 'saved' ? 'Saved ✓' : state === 'error' ? 'Not saved — try again' : state === 'pending' ? '…' : ''}
        </span>
      </div>
      <textarea
        ref={box}
        value={text}
        onChange={(e) => {
          setText(e.target.value)
          setState('pending')
          if (timer.current) clearTimeout(timer.current)
          const v = e.target.value
          timer.current = setTimeout(() => void save(v), 900)
        }}
        onBlur={() => void save(text)}
        className="w-full min-h-24 resize-y bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm text-white leading-relaxed focus:outline-none focus:border-zinc-500"
      />
    </div>
  )
}
