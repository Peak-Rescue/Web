'use client'

import { useState } from 'react'
import { COURSE_TYPE_OPTIONS } from '@/lib/courses'
import { CAPABILITY_META, CAPABILITY_ORDER } from '@/lib/capabilities'

export function CourseTypeSelect({
  defaultCategory = '',
  defaultType = '',
  defaultCustomTitle = '',
  defaultCustomCategories = [],
  defaultInternal = false,
}: {
  defaultCategory?: string
  defaultType?: string
  defaultCustomTitle?: string
  defaultCustomCategories?: string[]
  defaultInternal?: boolean
}) {
  const [category, setCategory] = useState(defaultCategory)
  const [courseType, setCourseType] = useState(defaultType)
  const [internal, setInternal] = useState(defaultInternal)

  const selectedGroup = COURSE_TYPE_OPTIONS.find(g => g.category === category)
  const isCustom = courseType === 'custom'

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
            {isCustom && (
              <div className="w-full flex flex-wrap gap-x-4 gap-y-2 pt-2 mt-1 border-t border-zinc-700">
                {CAPABILITY_ORDER.map(cat => (
                  <label key={cat} className="flex items-center gap-1.5 text-sm text-zinc-300 cursor-pointer">
                    <input
                      type="checkbox"
                      name="custom_categories"
                      value={cat}
                      defaultChecked={defaultCustomCategories.includes(cat)}
                      className="accent-red-600"
                    />
                    {CAPABILITY_META[cat].label}
                  </label>
                ))}
              </div>
            )}
          </div>
          <p className="text-[11px] text-zinc-500 mt-1">
            {internal
              ? 'Seen only by the people added to it, and anyone can be added — the expertise tags are just a record of what it drew on.'
              : 'Instructors with expertise in a checked category see this course in their “All courses” calendar and count as qualified for staffing.'}
          </p>
        </div>
      )}
    </div>
  )
}
