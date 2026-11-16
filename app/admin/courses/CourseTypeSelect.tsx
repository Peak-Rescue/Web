'use client'

import { useState } from 'react'
import { COURSE_TYPE_OPTIONS } from '@/lib/courses'
import { CAPABILITY_META, CAPABILITY_ORDER } from '@/lib/capabilities'
import InfoHint from '@/components/InfoHint'

/** What a custom booking is. Only the new-course form asks. */
export type NewKind = 'course' | 'job' | 'meeting'

const KIND_LABEL: Record<NewKind, string> = {
  course: 'Course',
  job: 'Job or service',
  meeting: 'Internal meeting',
}

export function CourseTypeSelect({
  defaultCategory = '',
  defaultType = '',
  defaultCustomTitle = '',
  defaultCustomCategories = [],
  defaultInternal = false,
  kind = 'course',
  onKindChange,
}: {
  defaultCategory?: string
  defaultType?: string
  defaultCustomTitle?: string
  defaultCustomCategories?: string[]
  defaultInternal?: boolean
  /** The new-course form's fork, asked only once somebody has said Custom:
      a course of our own making, a job we are hired for, or a meeting of our
      own people. Asked here rather than at the top of the form because nearly
      everything made there is a course, and a question that is answered the
      same way nine times in ten is one to keep out of the way. While it is a
      meeting the name and the custom-event box are left to the meeting's own
      fields. */
  kind?: NewKind
  onKindChange?: (kind: NewKind) => void
}) {
  const meeting = kind === 'meeting'
  const job = kind === 'job'
  const [category, setCategory] = useState(defaultCategory)
  const [courseType, setCourseType] = useState(defaultType)
  const [internal, setInternal] = useState(defaultInternal)
  const [categories, setCategories] = useState<string[]>(defaultCustomCategories)

  const selectedGroup = COURSE_TYPE_OPTIONS.find(g => g.category === category)
  const isCustom = courseType === 'custom'
  // A typed course derives its disciplines from the offering; a custom one has
  // nothing to derive it from, so untagged it reaches nobody at all. Marking
  // every box required while none is ticked is what makes the browser say so
  // at the field — but only where there is a submit to block, which is the new
  // course and import forms. The details form auto-saves, so there it shows as
  // a caution rather than a refusal: a save that fails for a reason nobody can
  // read is worse than an untagged course. An internal day is exempt either
  // way — a planning day draws on no discipline and staffs nobody.
  const needsDiscipline = isCustom && (job || !internal) && categories.length === 0

  return (
    <div className="sm:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-4">
      {/* Step 1 — category */}
      <div>
        <label className="block text-xs text-zinc-400 mb-1">Category *</label>
        <select
          name="course_category"
          required
          value={category}
          onChange={e => { setCategory(e.target.value); setCourseType(''); onKindChange?.('course') }}
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
          onChange={e => { setCourseType(e.target.value); if (e.target.value !== 'custom') onKindChange?.('course') }}
          className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-zinc-500 disabled:opacity-40"
        >
          <option value="" disabled>{category ? 'Select a course…' : '← Pick a category first'}</option>
          {selectedGroup?.options.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
          {category && <option value="custom">Custom…</option>}
        </select>
      </div>

      {isCustom && onKindChange && (
        <div className="sm:col-span-2 flex gap-1 text-xs">
          {(Object.keys(KIND_LABEL) as NewKind[]).map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={kind === value}
              onClick={() => onKindChange(value)}
              className={`px-2.5 py-1 rounded-full border transition-colors ${
                kind === value
                  ? 'bg-zinc-800 border-zinc-600 text-white'
                  : 'border-zinc-800 text-zinc-500 hover:text-zinc-300'
              }`}
            >
              {KIND_LABEL[value]}
            </button>
          ))}
        </div>
      )}

      {/* Step 3 — custom name (only if custom selected) */}
      {isCustom && !meeting && (
        <div className="sm:col-span-2">
          {job && <input type="hidden" name="job" value="1" />}
          <label className="block text-xs text-zinc-400 mb-1">{job ? 'Job name *' : 'Custom course name *'}</label>
          <input
            name="custom_title"
            required
            defaultValue={defaultCustomTitle}
            placeholder={job ? undefined : 'e.g. Canyon Course — Taiwan'}
            className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-zinc-500"
          />
        </div>
      )}

      {/* Step 4 — what a custom event is, since it has no type to derive it
          from. Two unrelated things share the box because they appear on the
          same trigger: whether anyone enrols, and which discipline it draws on.
          Internal events belong here rather than in a field of their own —
          they are custom by nature, a CE day or a planning day or a
          consultation, and this block is already on screen the moment you say
          custom. It stays on screen for a typed course already marked, so no
          change of type can quietly drop the flag. */}
      {(isCustom || internal) && !meeting && (
        <div className="sm:col-span-2">
          <label className="block text-xs text-zinc-400 mb-1">Custom event</label>
          <div className="flex flex-wrap gap-x-4 gap-y-2 p-3 bg-zinc-800/50 border border-zinc-700 rounded">
            {/* A job is paid work by definition, so it is never internal. */}
            {!job && (
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
            )}
            {isCustom && (
              <div className={job ? 'w-full' : 'w-full pt-2 mt-1 border-t border-zinc-700'}>
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
            {internal && !job
              ? 'Seen only by the people added to it — anyone can be added.'
              : `Instructors signed off in a checked discipline see this ${job ? 'job' : 'course'} in their “All courses” calendar and count as qualified for staffing.`}
          </p>
        </div>
      )}
    </div>
  )
}
