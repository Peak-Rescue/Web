'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { courseShortName } from '@/lib/courses'

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
      href={`/admin/courses/${inst.id}`}
      className="flex items-start justify-between gap-4 p-4 bg-zinc-900 border border-zinc-800 rounded-lg hover:border-zinc-600 transition-colors"
    >
      <div className="min-w-0">
        <div className="flex items-center gap-2 mb-1 flex-wrap">
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded border uppercase tracking-wide ${STATUS_STYLES[inst.status] ?? ''}`}>
            {inst.status}
          </span>
          <span className="text-xs font-mono text-zinc-500">PR-{String(inst.ref_number).padStart(4, '0')}</span>
          <span className="font-medium truncate">{displayName}</span>
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

export default function CourseList({ upcoming, past }: { upcoming: Instance[]; past: Instance[] }) {
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('')
  const [courseType, setCourseType] = useState('')

  const typeOptions = useMemo(() => {
    const seen = new Map<string, string>()
    for (const i of [...upcoming, ...past]) {
      if (!seen.has(i.course_type)) seen.set(i.course_type, courseShortName(i.course_type, null))
    }
    return [...seen.entries()].sort((a, b) => a[1].localeCompare(b[1]))
  }, [upcoming, past])

  const filtering = query.trim() !== '' || status !== '' || courseType !== ''

  const matches = (inst: Instance) => {
    if (status && inst.status !== status) return false
    if (courseType && inst.course_type !== courseType) return false
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
      {/* ── Filters ─────────────────────────────────────────────── */}
      <div className="mb-6 flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search name, ref, client, location…"
            className="w-full bg-zinc-900 border border-zinc-800 rounded pl-9 pr-3 py-2 text-sm focus:outline-none focus:border-zinc-500 placeholder:text-zinc-600"
          />
        </div>
        <select
          value={status}
          onChange={e => setStatus(e.target.value)}
          className={`bg-zinc-900 border border-zinc-800 rounded px-3 py-2 text-sm focus:outline-none focus:border-zinc-500 ${status ? 'text-white' : 'text-zinc-500'}`}
        >
          <option value="">All statuses</option>
          {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s[0].toUpperCase() + s.slice(1)}</option>)}
        </select>
        <select
          value={courseType}
          onChange={e => setCourseType(e.target.value)}
          className={`max-w-[220px] bg-zinc-900 border border-zinc-800 rounded px-3 py-2 text-sm focus:outline-none focus:border-zinc-500 ${courseType ? 'text-white' : 'text-zinc-500'}`}
        >
          <option value="">All course types</option>
          {typeOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
        {filtering && (
          <button
            onClick={() => { setQuery(''); setStatus(''); setCourseType('') }}
            className="text-xs px-3 py-2 text-zinc-400 hover:text-white transition-colors"
          >
            Clear
          </button>
        )}
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
