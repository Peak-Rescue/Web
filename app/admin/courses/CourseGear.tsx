'use client'

import { useState } from 'react'
import { useSteadyRefresh } from '@/components/useSteadyRefresh'
import GearListEditor, { type GearItem, type GearList } from '@/app/admin/gear/GearListEditor'
import { createGearList, copyGearList, deleteGearList } from '@/app/admin/gear/actions'
import { ForPill } from '@/components/AudiencePills'

// A course's gear lists, built here rather than in a Google Doc that gets
// linked. Student and instructor lists are separate because they differ, and
// either can start from a saved template.
export default function CourseGear({
  instanceId,
  courseType,
  lists,
  templates,
  catalog,
  students,
}: {
  instanceId: string
  courseType: string | null
  // The course's maximum number of students, from the Details tab. Rows that
  // count by students — one each, one between four — are worked out from it, so
  // a roster that changes carries the whole list with it.
  students: number | null
  lists: GearList[]
  templates: { id: string; name: string; description?: string | null; audience: string; entries: number }[]
  catalog: GearItem[]
}) {
  const refresh = useSteadyRefresh()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function run(fn: () => Promise<unknown>) {
    setBusy(true); setError(null)
    try { await fn(); refresh() }
    catch (e) { setError(e instanceof Error ? e.message : 'That didn’t work') }
    finally { setBusy(false) }
  }

  return (
    <div className="space-y-8">
      {error && <p className="text-sm text-pr-red">{error}</p>}

      {lists.length === 0 && (
        <p className="text-sm text-zinc-500">
          No gear list yet. Start one from scratch or from a saved template — items come from the gear catalog, so a
          changed recommendation reaches every list that uses it.
        </p>
      )}

      {lists.map((l) => (
        <section key={l.id}>
          <div className="flex items-center gap-3 flex-wrap mb-3">
            <h3 className="text-base font-semibold">{l.name}</h3>
            <ForPill audience={l.audience} />
            <button
              onClick={() => { if (confirm(`Delete "${l.name}"?`)) run(() => deleteGearList(l.id)) }}
              disabled={busy}
              className="ml-auto text-xs text-zinc-600 hover:text-red-400 transition-colors"
            >
              Delete list
            </button>
          </div>
          <GearListEditor
            list={l} catalog={catalog} courseType={courseType}
            templates={templates} students={students}
          />
        </section>
      ))}

      <div className="p-3 bg-zinc-900 border border-dashed border-zinc-700 rounded-lg space-y-2">
        <p className="text-xs text-zinc-500">Add a list</p>
        <div className="flex flex-wrap gap-2">
          {(['student', 'instructor'] as const).map((a) => (
            <button
              key={a}
              onClick={() => run(() => createGearList({
                name: a === 'student' ? 'Student gear list' : 'Instructor gear list',
                audience: a, instanceId, courseType,
              }))}
              disabled={busy}
              className="text-xs px-3 py-1.5 rounded border border-zinc-700 text-zinc-300 hover:text-white hover:border-zinc-500 transition-colors disabled:opacity-40"
            >
              + Blank {a} list
            </button>
          ))}
          {templates.map((t) => (
            <button
              key={t.id}
              onClick={() => run(() => copyGearList(t.id, { instanceId, name: t.name }))}
              disabled={busy}
              title={[`${t.entries} item(s), ${t.audience}`, t.description].filter(Boolean).join(' — ')}
              className="text-xs px-3 py-1.5 rounded border border-zinc-700 text-zinc-300 hover:text-white hover:border-zinc-500 transition-colors disabled:opacity-40"
            >
              {t.name}
              <span className="text-zinc-600 ml-1.5">{t.entries}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
