'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  addGearEntry, updateGearEntry, removeGearEntry, updateGearList, copyGearList,
} from './actions'

export type GearItem = {
  id: string
  name: string
  info: string | null
  recommended: string | null
  url: string | null
  category: string | null
}

export type GearEntry = {
  id: string
  gear_item_id: string | null
  name: string | null
  info: string | null
  recommended: string | null
  url: string | null
  category: string | null
  group_type: 'personal' | 'group'
  quantity: string | null
  sort_order: number
}

export type GearList = {
  id: string
  name: string
  audience: 'student' | 'instructor'
  intro: string | null
  instance_id: string | null
  is_template: boolean
  gear_list_entries: GearEntry[]
}

// Builds a list from the gear catalog instead of retyping it into a document.
// An entry either points at a catalog item — so a changed recommendation
// reaches every list using it — or carries its own text for a one-off.
export default function GearListEditor({
  list,
  catalog,
  courseType,
}: {
  list: GearList
  catalog: GearItem[]
  courseType?: string | null
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [picking, setPicking] = useState('')
  const [newName, setNewName] = useState('')
  const [category, setCategory] = useState('')
  const [groupType, setGroupType] = useState<'personal' | 'group'>('personal')

  const byId = useMemo(() => new Map(catalog.map((c) => [c.id, c])), [catalog])
  const resolve = (e: GearEntry) => {
    const c = e.gear_item_id ? byId.get(e.gear_item_id) : undefined
    return {
      name: e.name ?? c?.name ?? 'Item',
      info: e.info ?? c?.info ?? null,
      recommended: e.recommended ?? c?.recommended ?? null,
      url: e.url ?? c?.url ?? null,
      category: e.category ?? c?.category ?? 'Other',
      fromCatalog: Boolean(c),
    }
  }

  // Grouped the way the real lists are: personal kit first, then group kit,
  // each split into named categories.
  const grouped = useMemo(() => {
    const out: Record<'personal' | 'group', Record<string, (GearEntry & { r: ReturnType<typeof resolve> })[]>> = {
      personal: {}, group: {},
    }
    for (const e of [...list.gear_list_entries].sort((a, b) => a.sort_order - b.sort_order)) {
      const r = resolve(e)
      const bucket = out[e.group_type]
      bucket[r.category] = [...(bucket[r.category] ?? []), { ...e, r }]
    }
    return out
  }, [list.gear_list_entries, byId]) // eslint-disable-line react-hooks/exhaustive-deps

  const categories = [...new Set(catalog.map((c) => c.category).filter(Boolean) as string[])].sort()

  async function run(fn: () => Promise<unknown>) {
    setBusy(true); setError(null)
    try { await fn(); router.refresh() }
    catch (e) { setError(e instanceof Error ? e.message : 'That didn’t save') }
    finally { setBusy(false) }
  }

  const input = 'bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-sm focus:outline-none focus:border-zinc-500'

  return (
    <div className="space-y-4">
      {error && <p className="text-sm text-pr-red">{error}</p>}

      <textarea
        defaultValue={list.intro ?? ''}
        onBlur={(e) => run(() => updateGearList(list.id, { intro: e.target.value }))}
        rows={2}
        placeholder="Optional intro — why this kit, what the conditions are"
        className={`w-full resize-y ${input}`}
      />

      {(['personal', 'group'] as const).map((gt) => {
        const cats = grouped[gt]
        if (Object.keys(cats).length === 0) return null
        return (
          <div key={gt}>
            <h4 className="text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-1.5">
              {gt === 'personal' ? 'Personal — each person' : 'Group — shared kit'}
            </h4>
            {Object.entries(cats).map(([cat, entries]) => (
              <div key={cat} className="mb-3">
                <p className="text-[11px] text-zinc-500 mb-1">{cat}</p>
                <div className="border border-zinc-800 rounded divide-y divide-zinc-800/70">
                  {entries.map((e) => (
                    <div key={e.id} className="flex items-start gap-2 px-3 py-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          {e.r.url ? (
                            <a href={e.r.url} target="_blank" rel="noreferrer" className="text-sm hover:text-pr-red-light transition-colors">
                              {e.r.name}
                            </a>
                          ) : (
                            <span className="text-sm">{e.r.name}</span>
                          )}
                          {e.quantity && <span className="text-[11px] text-zinc-500">× {e.quantity}</span>}
                          {!e.r.fromCatalog && <span className="text-[10px] text-zinc-700">one-off</span>}
                        </div>
                        {(e.r.info || e.r.recommended) && (
                          <p className="text-[11px] text-zinc-600 mt-0.5">
                            {e.r.info}
                            {e.r.info && e.r.recommended && ' — '}
                            {e.r.recommended && <span className="text-zinc-500">{e.r.recommended}</span>}
                          </p>
                        )}
                      </div>
                      <input
                        defaultValue={e.quantity ?? ''}
                        onBlur={(ev) => ev.target.value !== (e.quantity ?? '') && run(() => updateGearEntry(e.id, { quantity: ev.target.value }))}
                        placeholder="qty"
                        className={`w-16 shrink-0 ${input}`}
                      />
                      <button
                        onClick={() => run(() => removeGearEntry(e.id))}
                        disabled={busy}
                        className="shrink-0 text-xs text-zinc-600 hover:text-red-400 transition-colors"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )
      })}

      {/* Add a row — from the catalog, or type a one-off */}
      <div className="p-3 bg-zinc-900 border border-dashed border-zinc-700 rounded-lg flex flex-wrap items-end gap-2">
        <div>
          <label className="block text-[11px] text-zinc-500 mb-1">From the catalog</label>
          <select value={picking} onChange={(e) => setPicking(e.target.value)} className={`${input} w-52`}>
            <option value="">— pick gear —</option>
            {catalog.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <span className="text-xs text-zinc-600 pb-2">or</span>
        <div>
          <label className="block text-[11px] text-zinc-500 mb-1">One-off item</label>
          <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Name" className={`${input} w-40`} />
        </div>
        <div>
          <label className="block text-[11px] text-zinc-500 mb-1">Category</label>
          <input list="gear-cats" value={category} onChange={(e) => setCategory(e.target.value)} placeholder="e.g. Rope hardware" className={`${input} w-40`} />
          <datalist id="gear-cats">{categories.map((c) => <option key={c} value={c} />)}</datalist>
        </div>
        <div>
          <label className="block text-[11px] text-zinc-500 mb-1">Carried by</label>
          <select value={groupType} onChange={(e) => setGroupType(e.target.value as 'personal' | 'group')} className={input}>
            <option value="personal">Each person</option>
            <option value="group">Group</option>
          </select>
        </div>
        <button
          onClick={() => {
            if (!picking && !newName.trim()) return
            run(async () => {
              await addGearEntry(list.id, {
                gearItemId: picking || null,
                name: newName || undefined,
                category: category || null,
                groupType,
              })
              setPicking(''); setNewName('')
            })
          }}
          disabled={busy || (!picking && !newName.trim())}
          className="px-3 py-1.5 rounded bg-pr-red hover:bg-pr-red-dark text-white text-sm font-medium transition-colors disabled:opacity-40"
        >
          Add
        </button>
      </div>

      {!list.is_template && (
        <button
          onClick={() => {
            const name = prompt('Save this list as a reusable template. Name it:', list.name)
            if (name) run(() => copyGearList(list.id, { isTemplate: true, name, courseType }))
          }}
          disabled={busy}
          className="text-xs text-zinc-400 hover:text-white transition-colors"
        >
          Save as a template
        </button>
      )}
    </div>
  )
}
