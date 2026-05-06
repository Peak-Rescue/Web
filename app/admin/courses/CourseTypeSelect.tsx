'use client'

import { useState } from 'react'
import { COURSE_TYPE_OPTIONS } from '@/lib/courses'

export function CourseTypeSelect({
  defaultCategory = '',
  defaultType = '',
  defaultCustomTitle = '',
}: {
  defaultCategory?: string
  defaultType?: string
  defaultCustomTitle?: string
}) {
  const [category, setCategory] = useState(defaultCategory)
  const [courseType, setCourseType] = useState(defaultType)

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
    </div>
  )
}
