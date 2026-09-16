'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { updateCourseSetup } from './actions'
import { COURSE_TYPE_OPTIONS, courseShortName } from '@/lib/courses'
import { CAPABILITY_META, CAPABILITY_ORDER, courseCapabilityCategories } from '@/lib/capabilities'

/** A curriculum setup as this shelf lists it: what it says about itself, and
    what it would put on a course. */
export type CourseSetup = {
  id: string
  name: string
  description: string | null
  course_type: string | null
  disciplines: string[]
  sections: { title: string; items: string[] }[]
}

// A course setup on its shelf.
//
// These arrived with the Classroom import and were read-only ever since: eleven
// rows nothing in the portal could list, let alone tag. A course page offers
// the ones that fit it first, and "fits" is read off the two fields here — so
// an untagged setup was one nobody could ever be shown on purpose.
//
// What it is made of stays read-only. The sections and the material in them
// are the shape of a class, edited where that material lives; the errand here
// is saying what kind of course this shape is for.
export default function CourseSetupRow({ setup }: { setup: CourseSetup }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // The two fields something else on this row reads back live in state: the
  // offering ticks its own disciplines, and the disciplines are checkboxes.
  const [form, setForm] = useState({
    course_type: setup.course_type ?? '',
    disciplines: setup.disciplines,
  })

  const input = 'w-full bg-zinc-800 border border-zinc-700 rounded px-2.5 py-1.5 text-sm focus:outline-none focus:border-zinc-500'

  async function patch(p: Parameters<typeof updateCourseSetup>[1]) {
    setBusy(true); setError(null)
    try { await updateCourseSetup(setup.id, p); router.refresh() }
    catch (e) { setError(e instanceof Error ? e.message : 'That didn’t save') }
    finally { setBusy(false) }
  }

  // The offering already says which expertise this is — a Swiftwater setup is
  // water work whether or not anyone ticks the box — so the box is shown
  // checked and held there rather than left for a human to keep in sync. The
  // matching that reads these does the same derivation.
  const implied = courseCapabilityCategories(form.course_type || '', null) as string[]
  const impliedFrom = form.course_type ? courseShortName(form.course_type, null) : null
  const offering = setup.course_type ? courseShortName(setup.course_type, null) : null
  // An offering the picker no longer lists is still offered as the option it
  // was saved with, so changing your mind is not a one-way door.
  const retiredOffering =
    setup.course_type && !COURSE_TYPE_OPTIONS.some((g) => g.options.some((o) => o.value === setup.course_type))
      ? setup.course_type
      : null

  const tags = [...new Set([
    ...courseCapabilityCategories(setup.course_type ?? '', null) as string[],
    ...setup.disciplines,
  ])].map((d) => CAPABILITY_META[d as keyof typeof CAPABILITY_META]?.label ?? d)

  const itemCount = setup.sections.reduce((n, s) => n + s.items.length, 0)

  return (
    <div id={`t-${setup.id}`} className="rounded-lg border border-zinc-800 bg-zinc-900 scroll-mt-24">
      <div className="flex items-start gap-3 px-3 py-2.5">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium truncate">{setup.name}</span>
            {offering && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-900/40 text-blue-300">{offering}</span>
            )}
            <span className="text-[11px] text-zinc-600">
              {setup.sections.length} section{setup.sections.length === 1 ? '' : 's'} · {itemCount} item{itemCount === 1 ? '' : 's'}
            </span>
          </div>
          {/* An untagged setup reaches no course by itself, which is the one
              fact about it worth saying on a collapsed row. */}
          <p className="text-[11px] text-zinc-600 mt-1 truncate">
            {setup.description || 'no note — say what this setup is for'}
            {' · '}
            {tags.join(', ') || (
              <span className="text-amber-500/80">untagged — no course is offered this</span>
            )}
          </p>
        </div>

        <button
          onClick={() => setOpen(!open)}
          className="shrink-0 text-xs text-zinc-400 hover:text-white transition-colors"
        >
          {open ? 'Close' : 'Edit'}
        </button>
      </div>

      {error && <p className="px-3 pb-2 text-xs text-pr-red">{error}</p>}

      {open && (
        <div className="border-t border-zinc-800">
          <div className="px-3 pt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2">
              <Label>Name</Label>
              <input
                className={input}
                defaultValue={setup.name}
                onBlur={(e) => e.target.value !== setup.name && patch({ name: e.target.value })}
              />
            </div>
            <div className="sm:col-span-2">
              <Label hint="Internal — never shown to students.">Note</Label>
              <input
                className={input}
                defaultValue={setup.description ?? ''}
                placeholder="What this shape is for, and when to reach for it"
                onBlur={(e) =>
                  e.target.value !== (setup.description ?? '') && patch({ description: e.target.value })}
              />
            </div>
            <div>
              <Label hint="Its courses see this setup first, and its discipline is ticked below. A custom course has no offering, so disciplines are all it matches on.">
                Offering
              </Label>
              <select
                className={input}
                value={form.course_type}
                disabled={busy}
                onChange={(e) => {
                  setForm({ ...form, course_type: e.target.value })
                  patch({ courseType: e.target.value || null })
                }}
              >
                <option value="">— any offering —</option>
                {retiredOffering && (
                  <option value={retiredOffering}>{courseShortName(retiredOffering, null)}</option>
                )}
                {COURSE_TYPE_OPTIONS.map((g) => (
                  <optgroup key={g.category} label={g.label}>
                    {g.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </optgroup>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2">
              <Label hint="How a course with no matching offering finds this. The offering's own discipline is ticked and locked.">
                Disciplines
              </Label>
              <div className="flex flex-wrap gap-x-4 gap-y-1.5 p-2 bg-zinc-800/50 border border-zinc-700 rounded">
                {CAPABILITY_ORDER.map((c) => {
                  const fromOffering = implied.includes(c)
                  return (
                    <label
                      key={c}
                      title={fromOffering ? `Comes with the ${impliedFrom} offering` : undefined}
                      className={`flex items-center gap-1.5 text-xs ${
                        fromOffering ? 'text-zinc-500 cursor-default' : 'text-zinc-300 cursor-pointer'
                      }`}
                    >
                      <input
                        type="checkbox"
                        className="accent-red-600"
                        checked={fromOffering || form.disciplines.includes(c)}
                        disabled={fromOffering || busy}
                        onChange={() => {
                          const disciplines = form.disciplines.includes(c)
                            ? form.disciplines.filter((x) => x !== c)
                            : [...form.disciplines, c]
                          setForm({ ...form, disciplines })
                          patch({ disciplines })
                        }}
                      />
                      {CAPABILITY_META[c].label}
                    </label>
                  )
                })}
              </div>
            </div>
          </div>

          {/* What it would add, so tagging it is not done blind. Read-only:
              the material itself is the library's, and the sections are the
              shape the class was imported with. */}
          <div className="px-3 py-3 mt-3 border-t border-zinc-800">
            <p className="text-[11px] uppercase tracking-widest text-zinc-600 mb-2">What it puts on a course</p>
            <div className="space-y-2 max-h-72 overflow-y-auto">
              {setup.sections.map((s, i) => (
                <details key={i} className="group">
                  <summary className="cursor-pointer list-none flex items-center gap-2 text-sm text-zinc-300">
                    <span aria-hidden className="text-zinc-600 text-[10px] transition-transform group-open:rotate-90">▶</span>
                    {s.title}
                    <span className="text-[10px] text-zinc-600">{s.items.length}</span>
                  </summary>
                  <ul className="mt-1 pl-6 space-y-0.5">
                    {s.items.map((t, j) => <li key={j} className="text-[11px] text-zinc-500">{t}</li>)}
                    {s.items.length === 0 && <li className="text-[11px] text-zinc-700">nothing in this section</li>}
                  </ul>
                </details>
              ))}
              {setup.sections.length === 0 && (
                <p className="text-[11px] text-zinc-600">This setup has no sections yet.</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Label({ children, hint }: { children: React.ReactNode; hint?: string }) {
  return (
    <label className="block text-[11px] uppercase tracking-widest text-zinc-500 mb-1" title={hint}>
      {children}
    </label>
  )
}
