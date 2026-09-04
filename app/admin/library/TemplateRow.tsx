'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import GearListEditor, { type GearItem, type GearList } from '@/app/admin/gear/GearListEditor'
import ScheduleEditor, { type Schedule, type SiteOption } from '@/app/admin/schedules/ScheduleEditor'
import { updateGearList, deleteGearList } from '@/app/admin/gear/actions'
import { updateSchedule, deleteSchedule } from '@/app/admin/schedules/actions'
import { TEMPLATE_SHELF_META, type TemplateShelf, type TemplateSummary } from '@/lib/library'
import { CAPABILITY_META, CAPABILITY_ORDER, courseCapabilityCategories } from '@/lib/capabilities'
import { ForPill } from '@/components/AudiencePills'
import { COURSE_TYPE_OPTIONS, courseShortName } from '@/lib/courses'
import InfoHint from '@/components/InfoHint'

const input =
  'w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-sm focus:outline-none focus:border-zinc-500'
// A field's name, and — behind the icon — the sentence about it that would
// otherwise sit on screen forever after the one time anyone needed it.
const Label = ({ children, hint }: { children: string; hint?: string }) => (
  <span className="flex items-center gap-1.5 mb-1">
    <span className="text-[11px] text-zinc-500">{children}</span>
    {hint && <InfoHint text={hint} below />}
  </span>
)

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
//
// Open is one thing, not two. The row used to offer 'Days' beside 'Edit', which
// is two unlabelled destinations you had to click to tell apart — and the split
// was ours, not the template's: what a schedule is for and what happens on day
// three are the same object. So there is a single Edit, and everything it holds
// is on one page: what it is at the top, what's in it below.
export default function TemplateRow(props: Props) {
  const { summary, shelf, initialOpen } = props
  const router = useRouter()
  const [open, setOpen] = useState(initialOpen !== undefined)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Only the two fields something else on this page reads back live in state:
  // the offering drives which disciplines are ticked for you, and the
  // disciplines are checkboxes. The text fields are uncontrolled and save on
  // the way out, the way every other editor in the portal does it.
  const [form, setForm] = useState({
    course_type: summary.course_type ?? '',
    audience: summary.audience ?? 'student',
    disciplines: summary.disciplines,
  })

  const meta = TEMPLATE_SHELF_META[shelf as TemplateShelf]

  async function run(fn: () => Promise<unknown>) {
    setBusy(true); setError(null)
    try { await fn(); router.refresh() }
    catch (e) { setError(e instanceof Error ? e.message : 'That didn’t save') }
    finally { setBusy(false) }
  }

  // One field at a time, on blur or on change — there is no Save button to
  // press, so there is no half-typed state to lose track of either.
  type Patch = {
    name?: string
    description?: string | null
    courseType?: string | null
    disciplines?: string[]
    topics?: string[]
    audience?: 'student' | 'instructor'
  }
  const patch = ({ audience, ...shared }: Patch) => run(() =>
    props.shelf === 'gear'
      ? updateGearList(summary.id, { ...shared, ...(audience ? { audience } : {}) })
      : updateSchedule(summary.id, shared))

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
  // The offering already says which expertise this is — Urban Mobility is
  // urban work whether or not anyone ticks the box — so the box is shown
  // checked and held there rather than left for a human to keep in sync. The
  // matching that reads these does the same derivation, so an unticked box was
  // never actually wrong; it just looked it, which is its own bug.
  const implied = courseCapabilityCategories(form.course_type || '', null) as string[]
  const impliedFrom = form.course_type ? courseShortName(form.course_type, null) : null

  const offering = summary.course_type ? courseShortName(summary.course_type, null) : null
  // An offering the picker no longer lists — a retired slug — is still offered
  // as the option it was saved with, so changing your mind is not a one-way
  // door. Keyed off what's on the shelf, not what's in the box: keying it off
  // the current choice made the old value vanish the moment you left it.
  const retiredOffering =
    summary.course_type &&
    !COURSE_TYPE_OPTIONS.some((g) => g.options.some((o) => o.value === summary.course_type))
      ? summary.course_type
      : null

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
            {[...new Set([
              ...courseCapabilityCategories(summary.course_type ?? '', null) as string[],
              ...summary.disciplines,
            ])].map((d) => CAPABILITY_META[d as keyof typeof CAPABILITY_META]?.label ?? d).join(', ')
              || 'no expertise tag'}
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => setOpen(!open)}
            className="text-xs text-zinc-400 hover:text-white transition-colors"
          >
            {open ? 'Close' : 'Edit'}
          </button>
        </div>
      </div>

      {error && <p className="px-3 pb-2 text-xs text-pr-red">{error}</p>}

      {open && (
        <div className="border-t border-zinc-800">
          <div className="px-3 pt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2">
              <Label>Name</Label>
              <input
                className={input}
                defaultValue={summary.name}
                onBlur={(e) => e.target.value !== summary.name && patch({ name: e.target.value })}
              />
            </div>
            <div className="sm:col-span-2">
              <Label hint="Internal — never shown to students.">Note</Label>
              <input
                className={input}
                defaultValue={summary.description ?? ''}
                onBlur={(e) =>
                  e.target.value !== (summary.description ?? '') && patch({ description: e.target.value })}
                placeholder={shelf === 'gear' ? 'Cold-water kit; assumes the client supplies helmets' : 'Three-day version, no night ops'}
              />
            </div>
            <div>
              <Label hint="Its courses see this template first, and its discipline is ticked below. A custom course has no offering, so disciplines are all it matches on.">Offering</Label>
              <select
                className={input}
                value={form.course_type}
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
            {props.shelf === 'gear' && (
              <div>
                <Label>Who carries it</Label>
                <select
                  className={input}
                  value={form.audience}
                  onChange={(e) => {
                    const audience = e.target.value as 'student' | 'instructor'
                    setForm({ ...form, audience })
                    patch({ audience })
                  }}
                >
                  <option value="student">Students</option>
                  <option value="instructor">Instructors</option>
                </select>
              </div>
            )}
            <div className="sm:col-span-2">
              <Label hint="How a custom course finds this. The offering's own discipline is ticked and locked.">Disciplines</Label>
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
                        disabled={fromOffering}
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
            <div className="sm:col-span-2">
              <Label>Topics</Label>
              <input
                className={input}
                placeholder="swiftwater, night ops"
                defaultValue={summary.topics.join(', ')}
                onBlur={(e) => {
                  const topics = e.target.value.split(',').map((t) => t.trim()).filter(Boolean)
                  if (topics.join(', ') !== summary.topics.join(', ')) patch({ topics })
                }}
              />
            </div>
          </div>

          <div className="px-3 pt-4 mt-3 border-t border-zinc-800">
            {props.shelf === 'gear'
              ? <GearListEditor list={props.list} catalog={props.catalog} courseType={summary.course_type} />
              : <ScheduleEditor schedule={props.schedule} courseType={summary.course_type} sites={props.sites} />}
          </div>

          <div className="px-3 py-3 mt-3 border-t border-zinc-800 flex justify-end">
            <button
              onClick={remove}
              disabled={busy}
              className="text-xs text-zinc-600 hover:text-red-400 transition-colors"
            >
              Delete
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
