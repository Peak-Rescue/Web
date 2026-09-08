'use client'

import { useState } from 'react'
import { useSteadyRefresh } from '@/components/useSteadyRefresh'
import GearListEditor, { type GearItem, type GearList } from '@/app/admin/gear/GearListEditor'
import { createGearList, copyGearList, deleteGearList } from '@/app/admin/gear/actions'
import TemplatePicker, { type TemplateChoice } from '@/components/TemplatePicker'

// A course's gear lists, built here rather than in a Google Doc that gets
// linked. Student and instructor lists are separate because they differ, and
// either can start from a saved template.
//
// Starting a list is a course-level act, so it sits above the lists. It used
// to be a permanent dashed panel *below* them, which put "add a gear list"
// directly under the last row of the list you were reading — so it read as
// another way to add to that list rather than as a way to begin a new one.
// Folded as well as moved: three buttons standing open forever is three
// answers to a question you ask once per course.
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
  // Two shapes for two jobs: the picker below browses them, and the editor's
  // "save over one" menu only needs a name and a size.
  templates: (TemplateChoice & { audience: string; entries: number })[]
  catalog: GearItem[]
}) {
  const refresh = useSteadyRefresh()
  const [busy, setBusy] = useState(false)
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function run(fn: () => Promise<unknown>) {
    setBusy(true); setError(null)
    try { await fn(); refresh() }
    catch (e) { setError(e instanceof Error ? e.message : 'That didn’t work') }
    finally { setBusy(false) }
  }

  // Nothing to add to yet, so the panel opens itself rather than hiding the
  // only thing there is to do behind a button.
  const open = adding || lists.length === 0

  return (
    <div className="space-y-8">
      {error && <p className="text-sm text-pr-red">{error}</p>}

      <div>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          {lists.length === 0 ? (
            <p className="text-sm text-zinc-500">
              No gear list yet. Items come from the gear catalog, so a changed recommendation
              reaches every list that uses it.
            </p>
          ) : (
            <span />
          )}
          {lists.length > 0 && (
            <button
              onClick={() => setAdding((v) => !v)}
              className="text-xs px-3 py-1.5 rounded border border-zinc-700 text-zinc-300 hover:text-white hover:border-zinc-500 transition-colors"
            >
              {adding ? 'Cancel' : '+ Add list'}
            </button>
          )}
        </div>

        {open && (
          <div className="mt-2 p-3 bg-zinc-900 border border-dashed border-zinc-700 rounded-lg space-y-2">
            <div className="flex flex-wrap gap-2">
              {(['student', 'instructor'] as const).map((a) => (
                <button
                  key={a}
                  onClick={() => run(async () => {
                    await createGearList({
                      name: a === 'student' ? 'Student gear list' : 'Instructor gear list',
                      audience: a, instanceId, courseType,
                    })
                    setAdding(false)
                  })}
                  disabled={busy}
                  className="text-xs px-3 py-1.5 rounded border border-zinc-700 text-zinc-300 hover:text-white hover:border-zinc-500 transition-colors disabled:opacity-40"
                >
                  + Blank {a} list
                </button>
              ))}
            </div>
            <TemplatePicker
              shelf="gear"
              title="Start from a saved list"
              countNoun="item"
              emptyPreview="Nothing on this template yet."
              templates={templates}
              busy={busy}
              onUse={(t) => run(async () => {
                await copyGearList(t.id, { instanceId, name: t.name })
                setAdding(false)
              })}
            />
          </div>
        )}
      </div>

      {lists.map((l) => (
        <section key={l.id}>
          {/* The header is the editor's — name, audience, roster, Print, Save
              as template, Delete, all on one row. It used to be split: name and
              Delete here, Print inside the editor, the template block at the
              foot of it. */}
          <GearListEditor
            list={l} catalog={catalog} courseType={courseType}
            templates={templates} students={students}
            onDelete={() => { if (confirm(`Delete "${l.name}"?`)) run(() => deleteGearList(l.id)) }}
          />
        </section>
      ))}

    </div>
  )
}
