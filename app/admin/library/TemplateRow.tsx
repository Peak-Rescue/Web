'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import TrashIcon from '@/components/TrashIcon'
import { GearBody, ScheduleBody } from './TemplateReadOnly'
import FilingFields, { type FilingValue } from '@/components/FilingFields'
import GearListEditor, { type GearItem, type GearList } from '@/app/admin/gear/GearListEditor'
import ScheduleEditor, { type Schedule, type SiteOption } from '@/app/admin/schedules/ScheduleEditor'
import { updateGearList, deleteGearList } from '@/app/admin/gear/actions'
import { updateSchedule, deleteSchedule } from '@/app/admin/schedules/actions'
import { TEMPLATE_SHELF_META, type TemplateShelf, type TemplateSummary , type Venue } from '@/lib/library'
import { CAPABILITY_META, CAPABILITY_ORDER, courseCapabilityCategories } from '@/lib/capabilities'
import { ForPill } from '@/components/AudiencePills'
import { COURSE_TYPE_OPTIONS, courseShortName } from '@/lib/courses'
import InfoHint from '@/components/InfoHint'

const input =
  'w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-sm focus:outline-none focus:border-zinc-500'
// A field's name, and — behind the icon — the sentence about it that would
// otherwise sit on screen forever after the one time anyone needed it.
const hostOf = (url: string) => {
  try { return new URL(url).hostname.replace('www.', '') } catch { return 'link' }
}

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
  /** For the filing panel's location and client fields, which every shelf
      now has. */
  venues: Venue[]
  placeSites?: SiteOption[]
  clients?: { id: string; path: string }[]
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
  const [viewing, setViewing] = useState(false)
  const [open, setOpen] = useState(initialOpen !== undefined)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Only the two fields something else on this page reads back live in state:
  // the offering drives which disciplines are ticked for you, and the
  // disciplines are checkboxes. The text fields are uncontrolled and save on
  // the way out, the way every other editor in the portal does it.
  // A gear list stores who carries it; the library stores who can see it,
  // and they are the same answer in different words — the list a student
  // carries is the list a student can see. Translated here so the question
  // reads identically on every shelf.
  const [form, setForm] = useState<FilingValue>({
    title: summary.name,
    url: summary.url ?? '',
    kind: '',
    note: summary.description ?? '',
    course_types: summary.course_types ?? [],
    audience: summary.audience === 'instructor' ? 'internal' : 'shared',
    place: summary.place,
    client_id: summary.client_id ?? null,
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

  // One field at a time, on blur or on change — there is no Save button to
  // press, so there is no half-typed state to lose track of either.
  type Patch = {
    name?: string
    description?: string | null
    courseTypes?: string[]
    disciplines?: string[]
    topics?: string[]
    audience?: 'student' | 'instructor'
    /** A PlaceSelect value, resolved to venue/site/region by the action. */
    place?: string
    url?: string | null
    clientId?: string | null
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
  // The offering already says which discipline this is — Urban Mobility is
  // urban work whether or not anyone ticks the box — so the box is shown
  // checked and held there rather than left for a human to keep in sync. The
  // matching that reads these does the same derivation, so an unticked box was
  // never actually wrong; it just looked it, which is its own bug.
  const implied = [...new Set(form.course_types.flatMap((ct) => courseCapabilityCategories(ct, null) as string[]))]
  const impliedFrom = form.course_types.map((ct) => courseShortName(ct, null)).join(', ') || null

  const offerings = (summary.course_types ?? []).map((ct) => courseShortName(ct, null))
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
            <button
              type="button"
              onClick={() => { setViewing((v) => !v); setOpen(false) }}
              title="See it the way an instructor does"
              className="text-sm font-medium truncate text-left hover:text-white transition-colors"
            >
              {summary.name}
            </button>
            {/* The noun, not the shelf's name: one row is a gear list, and
                "Gear lists" on it read as a second type beside "Kit list"
                rather than as the shape this one is. */}
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400">
              {meta.noun[0].toUpperCase() + meta.noun.slice(1)}
            </span>
            {summary.audience && (
              <ForPill audience={summary.audience} />
            )}
            {offerings.map((o) => (
              <span key={o} className="text-[10px] px-1.5 py-0.5 rounded bg-blue-900/40 text-blue-300">{o}</span>
            ))}
            <span className="text-[11px] text-zinc-600">
              {summary.count} {shelf === 'gear' ? `item${summary.count === 1 ? '' : 's'}` : `day${summary.count === 1 ? '' : 's'}`}
            </span>
          </div>
          {/* Only what the row has. "no note — say what this is for" sat
              under almost every row, because almost nothing needs a note:
              the title says it, and the note is for the exception. A line of
              grey telling you a field is empty is a line you learn to read
              past, which is how it hid the rows that did have something. */}
          {(summary.url || summary.description || summary.disciplines.length > 0 || (summary.course_types ?? []).length > 0) && (
            <p className="text-[11px] text-zinc-600 mt-1 truncate">
              {[
                summary.url ? hostOf(summary.url) : null,
                summary.description,
                [...new Set([
                  ...(summary.course_types ?? []).flatMap((ct) => courseCapabilityCategories(ct, null) as string[]),
                  ...summary.disciplines,
                ])].map((d) => CAPABILITY_META[d as keyof typeof CAPABILITY_META]?.label ?? d).join(', ') || null,
              ].filter(Boolean).join(' · ')}
            </p>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => setOpen(!open)}
            className="text-xs text-zinc-400 hover:text-white transition-colors"
          >
            {open ? 'Close' : 'Edit'}
          </button>
          {/* Beside Edit, like every document row on every other shelf. It
              was at the bottom of the open editor, so throwing one out meant
              opening it first — and a gear list and a manual are the same
              kind of thing to the person tidying a shelf. */}
          {!open && (
            <button
              onClick={remove}
              disabled={busy}
              aria-label={`Delete ${summary.name}`}
              className="text-xs text-zinc-600 hover:text-red-400 transition-colors disabled:opacity-40"
            >
              <TrashIcon />
            </button>
          )}
        </div>
      </div>

      {error && <p className="px-3 pb-2 text-xs text-pr-red">{error}</p>}

      {/* The instructors' view, on the admin's row. Edit is for changing it;
          the name is for reading it, and reading it was the one thing this
          row could not do without opening a form over the top of it. */}
      {viewing && !open && (
        <div className="px-3 pb-3 pt-1 border-t border-zinc-800">
          {props.shelf === 'gear'
            ? <GearBody list={props.list} catalog={props.catalog} />
            : <ScheduleBody schedule={props.schedule} />}
        </div>
      )}

      {open && (
        <div className="border-t border-zinc-800">
          <div className="px-3 pt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
            <FilingFields
              value={form}
              onChange={(next, changed) => {
                setForm(next)
                // Saved as it is changed, the way every other field on this
                // row has always been — the row has no Save button because
                // the editor underneath it has none either.
                if (changed === 'title') patch({ name: next.title })
                if (changed === 'course_types') patch({ courseTypes: next.course_types })
                if (changed === 'audience') patch({ audience: next.audience === 'internal' ? 'instructor' : 'student' })
                if (changed === 'url') patch({ url: next.url })
                if (changed === 'note') patch({ description: next.note })
                if (changed === 'disciplines') patch({ disciplines: next.disciplines })
                if (changed === 'place') patch({ place: next.place })
                if (changed === 'client_id') patch({ clientId: next.client_id })
                if (changed === 'topicsRaw')
                  patch({ topics: next.topicsRaw.split(',').map((t) => t.trim()).filter(Boolean) })
              }}
              venues={props.venues}
              sites={props.placeSites ?? []}
              clients={props.clients ?? []}
              fixedKind={meta.noun[0].toUpperCase() + meta.noun.slice(1)}
              audienceMode="template"
              offeringsHint="Courses of these offerings see it first. It still reaches any course sharing its discipline, so this ranks rather than restricts — unlike a library item, where an offering limits who is offered it."
              lockedDisciplines={implied}
              lockedFrom={impliedFrom}
            />
          </div>

          <div className="px-3 pt-4 mt-3 border-t border-zinc-800">
            {props.shelf === 'gear'
              ? <GearListEditor list={props.list} catalog={props.catalog} courseType={summary.course_types?.[0] ?? null} />
              : <ScheduleEditor
                  schedule={props.schedule}
                  courseType={summary.course_types?.[0] ?? null}
                  sites={props.sites}
                  // This is the shelf. There is nowhere to save it to from
                  // here — it is already the thing other schedules get saved
                  // into.
                  canTemplate={false}
                />}
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
