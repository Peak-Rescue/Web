'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import GearListEditor, { type GearItem, type GearList } from '@/app/admin/gear/GearListEditor'
import ScheduleEditor, { type Schedule, type SiteOption } from '@/app/admin/schedules/ScheduleEditor'
import { updateGearList, deleteGearList } from '@/app/admin/gear/actions'
import { updateSchedule, deleteSchedule } from '@/app/admin/schedules/actions'
import { TEMPLATE_SHELF_META, type TemplateShelf, type TemplateSummary } from '@/lib/library'
import { CAPABILITY_META, CAPABILITY_ORDER } from '@/lib/capabilities'
import { ForPill } from '@/components/AudiencePills'
import { COURSE_TYPE_OPTIONS, courseShortName } from '@/lib/courses'

const input =
  'w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-sm focus:outline-none focus:border-zinc-500'
const label = 'block text-[11px] text-zinc-500 mb-1'

type Props = {
  summary: TemplateSummary
  /** Opened on arrival when a course page linked straight to this template —
      the row is what you came for, so it shouldn't need a second click. */
  initialOpen?: 'contents' | 'details'
} & (
  | { shelf: 'gear'; list: GearList; catalog: GearItem[] }
  | { shelf: 'schedule'; schedule: Schedule; sites: SiteOption[] }
)

// A template on its shelf. Collapsed it reads like any other library row; open
// it and you get the same editor the course page uses, on the template itself —
// which is the thing that was missing. Saving a template used to be a one-way
// door: no way back in to fix a line, rename it, or retire it.
export default function TemplateRow(props: Props) {
  const { summary, shelf, initialOpen } = props
  const router = useRouter()
  const [open, setOpen] = useState<'none' | 'contents' | 'details'>(initialOpen ?? 'none')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState({
    name: summary.name,
    description: summary.description ?? '',
    course_type: summary.course_type ?? '',
    audience: summary.audience ?? 'student',
    disciplines: summary.disciplines,
    topicsRaw: summary.topics.join(', '),
  })

  const meta = TEMPLATE_SHELF_META[shelf as TemplateShelf]

  async function run(fn: () => Promise<unknown>) {
    setBusy(true); setError(null)
    try { await fn(); router.refresh() }
    catch (e) { setError(e instanceof Error ? e.message : 'That didn’t save') }
    finally { setBusy(false) }
  }

  const save = () => run(async () => {
    const patch = {
      name: form.name,
      description: form.description,
      courseType: form.course_type || null,
      disciplines: form.disciplines,
      topics: form.topicsRaw.split(',').map((t) => t.trim()).filter(Boolean),
    }
    if (props.shelf === 'gear') {
      await updateGearList(summary.id, { ...patch, audience: form.audience as 'student' | 'instructor' })
    } else {
      await updateSchedule(summary.id, patch)
    }
    setOpen('none')
  })

  const remove = () => {
    if (!confirm(
      `Delete the "${summary.name}" ${meta.noun}? Courses already built from it keep their own copy.`
    )) return
    run(() => (props.shelf === 'gear' ? deleteGearList(summary.id) : deleteSchedule(summary.id)))
  }

  // An offering it belongs to, plus its disciplines, are what a course page's
  // picker matches on: templates that fit the course lead, and the rest are a
  // click away. A custom course has no offering worth matching — every one of
  // them says 'custom' — so its checked categories are what reach it, which is
  // why a mixed canyons-and-mountain course wants both tagged here.
  const offering = summary.course_type ? courseShortName(summary.course_type, null) : null
  const knownOffering = COURSE_TYPE_OPTIONS.some((g) => g.options.some((o) => o.value === form.course_type))

  return (
    <div
      id={`t-${summary.id}`}
      className={`rounded-lg border bg-zinc-900 scroll-mt-24 ${
        initialOpen ? 'border-zinc-600 ring-1 ring-zinc-700' : 'border-zinc-800'
      }`}
    >
      <div className="flex items-start gap-3 px-3 py-2.5">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium truncate">{summary.name}</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400">{meta.label}</span>
            {summary.audience && (
              <ForPill audience={summary.audience} />
            )}
            {offering && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-900/40 text-blue-300">{offering}</span>
            )}
            <span className="text-[11px] text-zinc-600">
              {summary.count} {shelf === 'gear' ? `item${summary.count === 1 ? '' : 's'}` : `day${summary.count === 1 ? '' : 's'}`}
            </span>
          </div>
          <p className="text-[11px] text-zinc-600 mt-1 truncate">
            {summary.description || `no note — say what this ${meta.noun} is for`}
            {' · '}
            {summary.disciplines.map((d) => CAPABILITY_META[d as keyof typeof CAPABILITY_META]?.label ?? d).join(', ')
              || 'no expertise tag'}
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => setOpen(open === 'contents' ? 'none' : 'contents')}
            className="text-xs text-zinc-400 hover:text-white transition-colors"
          >
            {open === 'contents' ? 'Close' : shelf === 'gear' ? 'Items' : 'Days'}
          </button>
          <button
            onClick={() => setOpen(open === 'details' ? 'none' : 'details')}
            className="text-xs text-zinc-400 hover:text-white transition-colors"
          >
            {open === 'details' ? 'Close' : 'Edit'}
          </button>
        </div>
      </div>

      {error && <p className="px-3 pb-2 text-xs text-pr-red">{error}</p>}

      {open === 'contents' && (
        <div className="px-3 pb-3 pt-3 border-t border-zinc-800">
          {props.shelf === 'gear'
            ? <GearListEditor list={props.list} catalog={props.catalog} courseType={summary.course_type} />
            : <ScheduleEditor schedule={props.schedule} courseType={summary.course_type} sites={props.sites} />}
        </div>
      )}

      {open === 'details' && (
        <div className="px-3 pb-3 pt-1 border-t border-zinc-800 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="sm:col-span-2">
            <label className={label}>Name</label>
            <input className={input} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="sm:col-span-2">
            <label className={label}>What it&rsquo;s for — internal note, never shown to students</label>
            <input
              className={input}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder={shelf === 'gear' ? 'Cold-water kit; assumes the client supplies helmets' : 'Three-day version, no night ops'}
            />
          </div>
          <div>
            <label className={label}>Offering it belongs to</label>
            <select
              className={input}
              value={form.course_type}
              onChange={(e) => setForm({ ...form, course_type: e.target.value })}
            >
              <option value="">— any offering —</option>
              {!knownOffering && form.course_type && (
                <option value={form.course_type}>{courseShortName(form.course_type, null)}</option>
              )}
              {COURSE_TYPE_OPTIONS.map((g) => (
                <optgroup key={g.category} label={g.label}>
                  {g.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </optgroup>
              ))}
            </select>
            <p className="text-xs text-zinc-500 mt-1">
              Its courses are offered this template first. Custom courses match on disciplines instead — they all
              share one slug, so the boxes below are what reaches them.
            </p>
          </div>
          {props.shelf === 'gear' && (
            <div>
              <label className={label}>Who carries it</label>
              <select
                className={input}
                value={form.audience}
                onChange={(e) => setForm({ ...form, audience: e.target.value as 'student' | 'instructor' })}
              >
                <option value="student">Students</option>
                <option value="instructor">Instructors</option>
              </select>
            </div>
          )}
          <div className="sm:col-span-2">
            <label className={label}>Disciplines — how a custom course finds this</label>
            <div className="flex flex-wrap gap-x-4 gap-y-1.5 p-2 bg-zinc-800/50 border border-zinc-700 rounded">
              {CAPABILITY_ORDER.map((c) => (
                <label key={c} className="flex items-center gap-1.5 text-xs text-zinc-300 cursor-pointer">
                  <input
                    type="checkbox"
                    className="accent-red-600"
                    checked={form.disciplines.includes(c)}
                    onChange={() => setForm({
                      ...form,
                      disciplines: form.disciplines.includes(c)
                        ? form.disciplines.filter((x) => x !== c)
                        : [...form.disciplines, c],
                    })}
                  />
                  {CAPABILITY_META[c].label}
                </label>
              ))}
            </div>
          </div>
          <div className="sm:col-span-2">
            <label className={label}>Topic tags (comma separated)</label>
            <input
              className={input}
              value={form.topicsRaw}
              onChange={(e) => setForm({ ...form, topicsRaw: e.target.value })}
            />
          </div>
          <div className="sm:col-span-2 flex items-center gap-3">
            <button
              onClick={save}
              disabled={busy}
              className="px-3 py-1.5 rounded bg-pr-red hover:bg-pr-red-dark text-white text-sm font-medium transition-colors disabled:opacity-40"
            >
              {busy ? 'Saving…' : 'Save'}
            </button>
            <button
              onClick={remove}
              disabled={busy}
              className="text-xs text-zinc-600 hover:text-red-400 transition-colors ml-auto"
            >
              Delete
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
