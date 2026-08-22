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

      {/* Who it's for. Orthogonal to the type — an internal course is still a
          canyon course; what differs is that our own people are the students,
          there's no client, and only the crew on it can see it. */}
      <div className="sm:col-span-2">
        <label className="block text-xs text-zinc-400 mb-1">Who it&rsquo;s for</label>
        <select
          name="internal"
          value={internal ? 'internal' : 'client'}
          onChange={e => setInternal(e.target.value === 'internal')}
          className="w-full sm:w-1/2 bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-zinc-500"
        >
          <option value="client">A client</option>
          <option value="internal">Our own instructors — development / CE</option>
        </select>
        {internal && (
          <p className="text-[11px] text-zinc-500 mt-1">
            Only the crew assigned to it will see this course — it stays off everyone else&rsquo;s
            &ldquo;All courses&rdquo; calendar. Add the instructors attending as crew.
          </p>
        )}
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

      {/* Step 4 — expertise categories (custom only). Standard courses derive
          these from their type; custom courses need an explicit tag so the
          right instructors see them on their calendar and count as qualified. */}
      {isCustom && (
        <div className="sm:col-span-2">
          <label className="block text-xs text-zinc-400 mb-1">Expertise categories</label>
          <div className="flex flex-wrap gap-x-4 gap-y-2 p-3 bg-zinc-800/50 border border-zinc-700 rounded">
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
          <p className="text-[11px] text-zinc-500 mt-1">
            Instructors with expertise in a checked category see this course in their “All courses” calendar and count as qualified for staffing.
          </p>
        </div>
      )}
    </div>
  )
}
