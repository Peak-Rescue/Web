'use client'

import { useState, useTransition } from 'react'
import { COURSE_TYPE_OPTIONS } from '@/lib/courses'
import { CAPABILITY_META, CAPABILITY_ORDER } from '@/lib/capabilities'
import InfoHint from '@/components/InfoHint'

export function CourseTypeSelect({
  defaultCategory = '',
  defaultType = '',
  defaultCustomTitle = '',
  defaultCustomCategories = [],
  defaultInternal = false,
  session,
  defaultStartTime = '',
  defaultEndTime = '',
  applyToSeries,
  defaultVideoUrl = '',
  defaultAllStaff = false,
}: {
  defaultCategory?: string
  defaultType?: string
  defaultCustomTitle?: string
  defaultCustomCategories?: string[]
  defaultInternal?: boolean
  /** Offer what makes an internal course a staff session: a start time, a
      call-in link, and whether everyone sees it. 'new' also offers to repeat
      it weekly, which only a form that creates can do. Left out on the import
      form, whose action reads none of them. */
  session?: 'new' | 'edit'
  defaultStartTime?: string
  defaultEndTime?: string
  /** Set on a week of a repeating session: copies what is on the form to the
      weeks still to come, and answers with how many it changed. */
  applyToSeries?: (formData: FormData) => Promise<number>
  defaultVideoUrl?: string
  defaultAllStaff?: boolean
}) {
  const [category, setCategory] = useState(defaultCategory)
  const [courseType, setCourseType] = useState(defaultType)
  const [internal, setInternal] = useState(defaultInternal)
  const [categories, setCategories] = useState<string[]>(defaultCustomCategories)
  const [allStaff, setAllStaff] = useState(defaultAllStaff)
  const [applying, startApplying] = useTransition()
  const [applied, setApplied] = useState<number | null>(null)

  const selectedGroup = COURSE_TYPE_OPTIONS.find(g => g.category === category)
  const isCustom = courseType === 'custom'
  // A typed course derives its expertise from the offering; a custom one has
  // nothing to derive it from, so untagged it reaches nobody at all. Marking
  // every box required while none is ticked is what makes the browser say so
  // at the field — but only where there is a submit to block, which is the new
  // course and import forms. The details form auto-saves, so there it shows as
  // a caution rather than a refusal: a save that fails for a reason nobody can
  // read is worse than an untagged course. An internal day is exempt either
  // way — a planning day draws on no discipline and staffs nobody.
  const needsDiscipline = isCustom && !internal && categories.length === 0

  return (
    <div className="sm:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-4">
      {/* Step 1 — category */}
      <div>
        <label className="block text-xs text-zinc-400 mb-1">Category *</label>
        <select
          name="course_category"
          required
          value={category}
          onChange={e => { setCategory(e.target.value); setCourseType('') }}
          className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-zinc-500"
        >
          <option value="" disabled>Select a category…</option>
          {COURSE_TYPE_OPTIONS.map(g => (
            <option key={g.category} value={g.category}>{g.label}</option>
          ))}
        </select>
      </div>

      {/* Step 2 — course type (only once a category is picked) */}
      <div>
        <label className="block text-xs text-zinc-400 mb-1">Course type *</label>
        <select
          name="course_type"
          required
          value={courseType}
          disabled={!category}
          onChange={e => setCourseType(e.target.value)}
          className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-zinc-500 disabled:opacity-40"
        >
          <option value="" disabled>{category ? 'Select a course…' : '← Pick a category first'}</option>
          {selectedGroup?.options.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
          {category && <option value="custom">Custom…</option>}
        </select>
      </div>

      {/* Step 3 — custom name (only if custom selected) */}
      {isCustom && (
        <div className="sm:col-span-2">
          <label className="block text-xs text-zinc-400 mb-1">Custom course name *</label>
          <input
            name="custom_title"
            required
            defaultValue={defaultCustomTitle}
            placeholder="e.g. Canyon Course — Taiwan"
            className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-zinc-500"
          />
        </div>
      )}

      {/* Step 4 — what a custom event is, since it has no type to derive it
          from. Two unrelated things share the box because they appear on the
          same trigger: whether anyone enrols, and which expertise it draws on.
          Internal events belong here rather than in a field of their own —
          they are custom by nature, a CE day or a planning day or a
          consultation, and this block is already on screen the moment you say
          custom. It stays on screen for a typed course already marked, so no
          change of type can quietly drop the flag. */}
      {(isCustom || internal) && (
        <div className="sm:col-span-2">
          <label className="block text-xs text-zinc-400 mb-1">Custom event</label>
          <div className="flex flex-wrap gap-x-4 gap-y-2 p-3 bg-zinc-800/50 border border-zinc-700 rounded">
            <label className="w-full flex items-center gap-1.5 text-sm text-zinc-300 cursor-pointer">
              <input
                type="checkbox"
                name="internal"
                checked={internal}
                onChange={e => setInternal(e.target.checked)}
                className="accent-red-600"
              />
              Internal — no students
            </label>
            {internal && session && (
              <div className="w-full grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 mt-1 border-t border-zinc-700">
                <label className="sm:col-span-2 flex items-center gap-1.5 text-sm text-zinc-300 cursor-pointer">
                  <input
                    type="checkbox"
                    name="all_staff"
                    checked={allStaff}
                    onChange={e => setAllStaff(e.target.checked)}
                    className="accent-red-600"
                  />
                  All staff see it
                  <InfoHint text="Puts it on every instructor’s calendar without adding them to the crew. For anyone not on the crew, clicking it there opens the video link." />
                </label>
                <div>
                  <label className="block text-xs text-zinc-400 mb-1">Start time (Mountain)</label>
                  <input
                    name="start_time"
                    type="time"
                    defaultValue={defaultStartTime.slice(0, 5)}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-zinc-500"
                  />
                </div>
                <div>
                  <label className="block text-xs text-zinc-400 mb-1">
                    End time
                    <InfoHint text="How long the Google Calendar event is drawn. Left empty, it is an hour." />
                  </label>
                  <input
                    name="end_time"
                    type="time"
                    defaultValue={defaultEndTime.slice(0, 5)}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-zinc-500"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs text-zinc-400 mb-1">Video link</label>
                  <input
                    name="video_url"
                    type="url"
                    defaultValue={defaultVideoUrl}
                    placeholder="https://meet.google.com/…"
                    className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-zinc-500"
                  />
                </div>
                {applyToSeries && (
                  <div className="sm:col-span-2 flex items-center gap-2">
                    <button
                      type="button"
                      disabled={applying}
                      onClick={(e) => {
                        const form = e.currentTarget.form
                        if (!form) return
                        const data = new FormData(form)
                        startApplying(async () => setApplied(await applyToSeries(data)))
                      }}
                      className="px-3 py-1.5 bg-zinc-700 hover:bg-zinc-600 text-white rounded text-xs font-medium transition-colors disabled:opacity-50"
                    >
                      {applying ? 'Applying…' : 'Apply to all upcoming weeks'}
                    </button>
                    <InfoHint text="Copies the times, the video link, who sees it and the location to every week of this series that has not happened yet. Each week keeps its own name, crew and notes." />
                    {applied !== null && !applying && (
                      <span className="text-xs text-zinc-400">{applied === 1 ? '1 week updated' : `${applied} weeks updated`}</span>
                    )}
                  </div>
                )}
                {session === 'new' && (
                  <div>
                    <label className="block text-xs text-zinc-400 mb-1">
                      Repeats weekly until
                      <InfoHint text="Makes one course a week, on the same weekday as the start date, up to and including this date. Each is its own course, so a week can be renamed, staffed or cancelled without touching the others." />
                    </label>
                    <input
                      name="repeat_until"
                      type="date"
                      className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-zinc-500"
                    />
                  </div>
                )}
              </div>
            )}
            {isCustom && (
              <div className="w-full pt-2 mt-1 border-t border-zinc-700">
                <p className="text-xs text-zinc-400 mb-2 flex items-center gap-1.5">
                  Disciplines *
                  {needsDiscipline && (
                    <InfoHint
                      caution
                      below
                      text="Until one is ticked this course reaches nobody: no template is suggested on it, no instructor sees it in All courses, and nobody counts as qualified to staff it."
                    />
                  )}
                </p>
                <div className="flex flex-wrap gap-x-4 gap-y-2">
                  {CAPABILITY_ORDER.map(cat => (
                    <label key={cat} className="flex items-center gap-1.5 text-sm text-zinc-300 cursor-pointer">
                      <input
                        type="checkbox"
                        name="custom_categories"
                        value={cat}
                        checked={categories.includes(cat)}
                        required={needsDiscipline}
                        onChange={e => setCategories(c =>
                          e.target.checked ? [...c, cat] : c.filter(x => x !== cat))}
                        className="accent-red-600"
                      />
                      {CAPABILITY_META[cat].label}
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>
          <p className="text-[11px] text-zinc-500 mt-1">
            {internal
              ? allStaff ? null : 'Seen only by the people added to it — anyone can be added.'
              : 'Instructors with expertise in a checked category see this course in their “All courses” calendar and count as qualified for staffing.'}
          </p>
        </div>
      )}
    </div>
  )
}
