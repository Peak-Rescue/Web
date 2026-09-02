'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { courseShortName, COURSE_TYPE_OPTIONS } from '@/lib/courses'

const STATUS_STYLES: Record<string, string> = {
  tentative: 'bg-yellow-900/40 text-yellow-300 border-yellow-700',
  quoted:    'bg-blue-900/40 text-blue-300 border-blue-700',
  confirmed:  'bg-teal-900/40 text-teal-300 border-teal-700',
  completed:  'bg-zinc-700 text-zinc-300 border-zinc-600',
  cancelled:  'bg-red-900/40 text-red-300 border-red-700',
}

const STATUS_OPTIONS = ['tentative', 'quoted', 'confirmed', 'completed', 'cancelled']

function formatDateRange(starts_at: string, ends_at: string) {
  const fmt = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  return starts_at === ends_at ? fmt(starts_at) : `${fmt(starts_at)} – ${fmt(ends_at)}`
}

export type Instance = {
  id: string
  ref_number: number
  slug: string | null
  course_type: string
  course_category: string | null
  custom_title: string | null
  status: string
  location: string | null
  client_name: string | null
  starts_at: string | null
  ends_at: string | null
  max_students: number | null
  internal?: boolean | null
  instance_instructors: { count: number }[]
  crew?: { role: string; instructors: { name: string } | null }[] | null
  enrollments: { count: number }[]
}

function InstanceCard({ inst }: { inst: Instance }) {
  const instructorCount = inst.instance_instructors?.[0]?.count ?? 0
  const studentCount    = inst.enrollments?.[0]?.count ?? 0
  const displayName = courseShortName(inst.course_type, inst.custom_title)

  return (
    <Link
      href={`/portal/${inst.id}`}
      // One per course listed: left to prefetch, showing the list
      // server-renders a whole course page for every course in it.
      prefetch={false}
      className="flex items-start justify-between gap-4 p-4 bg-zinc-900 border border-zinc-800 rounded-lg hover:border-zinc-600 transition-colors"
    >
      <div className="min-w-0">
        <div className="flex items-center gap-2 mb-1 flex-wrap">
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded border uppercase tracking-wide ${STATUS_STYLES[inst.status] ?? ''}`}>
            {inst.status}
          </span>
          <span className="text-xs font-mono text-zinc-500">PR-{String(inst.ref_number).padStart(4, '0')}</span>
          <span className="font-medium truncate">{displayName}</span>
          {/* The list has no colour coding, so the flag is a word here. */}
          {inst.internal && (
            <span
              title="No students — internal work, a consultation, anything without a roster"
              className="text-[10px] text-zinc-500 whitespace-nowrap"
            >
              No students
            </span>
          )}
        </div>
        <div className="text-sm text-zinc-400 flex flex-wrap gap-x-4 gap-y-0.5">
          {inst.starts_at && inst.ends_at && <span>{formatDateRange(inst.starts_at, inst.ends_at)}</span>}
          {inst.location && <span>{inst.location}</span>}
          {inst.client_name && <span>{inst.client_name}</span>}
        </div>
      </div>
      <div className="text-xs text-zinc-500 whitespace-nowrap text-right shrink-0">
        {instructorCount > 0 && <div>{instructorCount} instructor{instructorCount !== 1 ? 's' : ''}</div>}
        {inst.max_students && <div>{studentCount}/{inst.max_students} students</div>}
      </div>
    </Link>
  )
}

// Short row labels for the course-type groups (the full categoryMeta labels
// are too wide for the filter-bar gutter).
const CATEGORY_SHORT: Record<string, string> = {
  tactical: 'Tactical',
  sar: 'SAR',
  industrial: 'Industrial',
  specialty: 'Specialty',
}

export default function CourseList({ upcoming, past }: { upcoming: Instance[]; past: Instance[] }) {
  const [query, setQuery] = useState('')
  const [categories, setCategories] = useState<Set<string>>(new Set())
  const [types, setTypes] = useState<Set<string>>(new Set())
  const [statuses, setStatuses] = useState<Set<string>>(new Set())

  const toggleIn = (setter: React.Dispatch<React.SetStateAction<Set<string>>>) => (value: string) =>
    setter(prev => {
      const next = new Set(prev)
      if (next.has(value)) next.delete(value)
      else next.add(value)
      return next
    })
  const toggleCategory = toggleIn(setCategories)
  const toggleType = toggleIn(setTypes)
  const toggleStatus = toggleIn(setStatuses)

  // Actions default a missing category to tactical, so filters treat null the
  // same way.
  const instCategory = (i: Instance) => i.course_category ?? 'tactical'

  // Every custom course shares course_type === 'custom', so key custom courses
  // by category (custom:tactical, custom:industrial, …) — otherwise the
  // "Custom" chip in one category row would select custom courses in every row.
  const typeKey = (i: Instance) => i.course_type === 'custom' ? `custom:${instCategory(i)}` : i.course_type

  // Course types present in the data, grouped by category — the same
  // category → type structure used when a course is created.
  const typeGroups = useMemo(() => {
    const byCat = new Map<string, Map<string, string>>()
    for (const i of [...upcoming, ...past]) {
      const m = byCat.get(instCategory(i)) ?? new Map<string, string>()
      const key = typeKey(i)
      if (!m.has(key)) {
        m.set(key, i.course_type === 'custom' ? 'Custom' : courseShortName(i.course_type, null))
      }
      byCat.set(instCategory(i), m)
    }
    return COURSE_TYPE_OPTIONS.filter(g => byCat.has(g.category)).map(g => ({
      category: g.category as string,
      types: [...byCat.get(g.category)!.entries()].sort((a, b) => a[1].localeCompare(b[1])),
    }))
  }, [upcoming, past])

  const filtering = query.trim() !== '' || categories.size > 0 || types.size > 0 || statuses.size > 0

  // Check-all-that-apply: a checked category counts as all of its types, so
  // category and type picks OR together; status ANDs against that (mirrors
  // the instructor filter).
  const matches = (inst: Instance) => {
    if (
      (categories.size > 0 || types.size > 0) &&
      !categories.has(instCategory(inst)) &&
      !types.has(typeKey(inst))
    ) return false
    if (statuses.size > 0 && !statuses.has(inst.status)) return false
    const q = query.trim().toLowerCase()
    if (!q) return true
    const haystack = [
      courseShortName(inst.course_type, inst.custom_title),
      `pr-${String(inst.ref_number).padStart(4, '0')}`,
      String(inst.ref_number),
      inst.client_name ?? '',
      inst.location ?? '',
    ].join(' ').toLowerCase()
    return q.split(/\s+/).every(term => haystack.includes(term))
  }

  const shownUpcoming = filtering ? upcoming.filter(matches) : upcoming
  const shownPast     = filtering ? past.filter(matches) : past

  return (
    <>
      {/* ── Filters — check all that apply, like the instructor filter ── */}
      <div className="mb-6 p-4 bg-zinc-900 rounded-lg border border-zinc-800 space-y-4">
        <div className="flex items-center gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none">
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search name, ref, client, location…"
              className="w-full bg-zinc-800 border border-zinc-700 rounded pl-9 pr-3 py-2 text-sm focus:outline-none focus:border-zinc-500 placeholder:text-zinc-600"
            />
          </div>
          {filtering && (
            <button
              onClick={() => { setQuery(''); setCategories(new Set()); setTypes(new Set()); setStatuses(new Set()) }}
              className="text-xs px-3 py-2 text-zinc-400 hover:text-white transition-colors shrink-0"
            >
              Clear
            </button>
          )}
        </div>

        {/* Course type — one row per category; the category label is itself a
            toggle that selects everything in the row, type chips refine. */}
        {typeGroups.map(group => (
          <div key={group.category} className="flex flex-wrap items-center gap-3">
            <button
              onClick={() => toggleCategory(group.category)}
              title={`Select all ${CATEGORY_SHORT[group.category] ?? group.category} courses`}
              className={`w-24 shrink-0 px-2.5 py-1 rounded text-[11px] font-bold uppercase tracking-wider text-left transition-colors ${
                categories.has(group.category)
                  ? 'bg-pr-red-light text-white'
                  : 'bg-zinc-800 text-zinc-300 ring-1 ring-inset ring-zinc-600 hover:bg-zinc-700 hover:text-white'
              }`}
            >
              {CATEGORY_SHORT[group.category] ?? group.category}
            </button>
            <span className="self-stretch w-px bg-zinc-700 shrink-0" aria-hidden="true" />
            <div className="flex flex-wrap gap-2">
              {group.types.map(([value, label]) => (
                <button
                  key={`${group.category}:${value}`}
                  onClick={() => {
                    if (categories.has(group.category)) {
                      // Unchecking one type of a fully-selected category:
                      // swap the category pick for its other types.
                      setCategories(prev => {
                        const n = new Set(prev)
                        n.delete(group.category)
                        return n
                      })
                      setTypes(prev => {
                        const n = new Set(prev)
                        for (const [v] of group.types) {
                          if (v === value) n.delete(v)
                          else n.add(v)
                        }
                        return n
                      })
                    } else {
                      toggleType(value)
                    }
                  }}
                  className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                    types.has(value) || categories.has(group.category)
                      ? 'bg-teal-700 text-white'
                      : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-white'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        ))}

        {/* Status */}
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider w-24 shrink-0">Status</span>
          <span className="self-stretch w-px bg-zinc-700 shrink-0" aria-hidden="true" />
          <div className="flex flex-wrap gap-2">
            {STATUS_OPTIONS.map(s => (
              <button
                key={s}
                onClick={() => toggleStatus(s)}
                className={`px-2.5 py-1 rounded text-xs font-medium transition-colors capitalize border ${
                  statuses.has(s)
                    ? STATUS_STYLES[s]
                    : 'border-transparent bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-white'
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Upcoming ─────────────────────────────────────────────── */}
      <section className="mb-10">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-zinc-500 mb-3">
          Upcoming & Active
          <span className="ml-2 font-normal normal-case tracking-normal text-zinc-600">
            ({filtering ? `${shownUpcoming.length} of ${upcoming.length}` : upcoming.length})
          </span>
        </h2>
        {shownUpcoming.length === 0 ? (
          <p className="text-zinc-600 text-sm">{filtering ? 'No upcoming courses match.' : 'No upcoming courses.'}</p>
        ) : (
          <div className="space-y-3">
            {shownUpcoming.map(inst => <InstanceCard key={inst.id} inst={inst} />)}
          </div>
        )}
      </section>

      {/* ── Past ─────────────────────────────────────────────────── */}
      {past.length > 0 && (
        <section>
          <details open={filtering || undefined}>
            <summary className="cursor-pointer list-none group/past">
              <h2 className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-zinc-600 hover:text-zinc-400 transition-colors mb-3">
                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="transition-transform [[open]_&]:rotate-90">
                  <polyline points="9 18 15 12 9 6"/>
                </svg>
                Past
                <span className="font-normal normal-case tracking-normal text-zinc-700">
                  ({filtering ? `${shownPast.length} of ${past.length}` : past.length})
                </span>
              </h2>
            </summary>
            <div className="space-y-3 mt-3">
              {shownPast.length === 0 ? (
                <p className="text-zinc-600 text-sm">No past courses match.</p>
              ) : (
                shownPast.map(inst => <InstanceCard key={inst.id} inst={inst} />)
              )}
            </div>
          </details>
        </section>
      )}
    </>
  )
}
