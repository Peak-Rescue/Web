import { gearLabel, gearQuantity, isChoice, KIT_LABEL, placeSets, productName, type CatalogItem } from '@/lib/gear'
import { TEMPLATE_SHELF_META, type TemplateShelf, type TemplateSummary } from '@/lib/library'
import { CAPABILITY_META, type CapabilityCategory } from '@/lib/capabilities'
import { courseShortName } from '@/lib/courses'
import type { GearList } from '@/app/admin/gear/GearListEditor'
import type { Schedule } from '@/app/admin/schedules/types'

// A template on its shelf, for someone who can't change it.
//
// Instructors wanted the kit lists — knowing what the standard canyon list
// asks for is the errand, and it had no answer outside a course you happened
// to be on. TemplateRow is the answer for admins, but it *is* the editor: 286
// lines of form that saves on blur. There is no read-only mode to switch it
// into, and giving one to someone who can't save would be a page of controls
// that quietly do nothing.
//
// So this reads the same rows and prints them. It shares the logic that must
// not drift — placeSets, gearLabel, gearQuantity out of lib/gear — and none of
// the markup, because the markup is the part that differs on purpose.
//
// A <details>, not a client component: opening a row is the browser's job and
// this way the shelf costs no JavaScript at all.

type GearTemplate = GearList & { description: string | null; course_type: string | null; disciplines: string[] }
type ScheduleTemplate = Schedule & { description: string | null; course_type: string | null; disciplines: string[] }

export default function TemplateReadOnly(
  props: { summary: TemplateSummary } & (
    | { shelf: 'gear'; list: GearTemplate; catalog: CatalogItem[] }
    | { shelf: 'schedule'; schedule: ScheduleTemplate }
  )
) {
  const { summary, shelf } = props
  const meta = TEMPLATE_SHELF_META[shelf as TemplateShelf]

  return (
    <details className="group rounded-lg border border-zinc-800 bg-zinc-900/60 open:bg-zinc-900">
      <summary className="cursor-pointer list-none px-4 py-3 flex items-center gap-3">
        <span aria-hidden className="text-zinc-600 text-xs transition-transform group-open:rotate-90">▶</span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium">{summary.name}</span>
            {summary.course_type && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400">
                {courseShortName(summary.course_type, null)}
              </span>
            )}
            {summary.disciplines.map((d) => (
              <span key={d} className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400">
                {CAPABILITY_META[d as CapabilityCategory]?.label ?? d}
              </span>
            ))}
          </span>
          {summary.description && (
            <span className="block text-[11px] text-zinc-600 mt-0.5 truncate">{summary.description}</span>
          )}
        </span>
        <span className="shrink-0 text-[11px] text-zinc-500">
          {summary.count} {summary.count === 1 ? (shelf === 'gear' ? 'item' : 'day') : shelf === 'gear' ? 'items' : 'days'}
        </span>
      </summary>

      <div className="px-4 pb-4 pt-1 border-t border-zinc-800/70">
        {/* Said once, where it matters: this is the shape of the next course,
            not of any course already running. */}
        <p className="text-[11px] text-zinc-600 mb-3">{meta.hint}.</p>
        {props.shelf === 'gear'
          ? <GearBody list={props.list} catalog={props.catalog} />
          : <ScheduleBody schedule={props.schedule} />}
      </div>
    </details>
  )
}

function GearBody({ list, catalog }: { list: GearTemplate; catalog: CatalogItem[] }) {
  const byId = new Map(catalog.map((c) => [c.id, c]))
  const entries = list.gear_list_entries ?? []
  if (entries.length === 0) return <p className="text-sm text-zinc-500">Nothing on this list yet.</p>

  // Same two levels the student's list uses: which side of the list, then the
  // list's own headings.
  const groups: ('personal' | 'group')[] = ['personal', 'group']
  return (
    <div className="space-y-4">
      {groups.map((gt) => {
        const rows = entries.filter((e) => (e.group_type ?? 'personal') === gt)
        if (rows.length === 0) return null
        const bySection = new Map<string | null, typeof rows>()
        for (const r of rows) bySection.set(r.section ?? null, [...(bySection.get(r.section ?? null) ?? []), r])
        return (
          <div key={gt}>
            <h4 className="text-[13px] font-medium text-zinc-300 mb-2">
              {KIT_LABEL[gt]}
            </h4>
            <div className="ml-0.5 pl-3 border-l-2 border-zinc-800 space-y-2">
              {[...bySection.entries()].map(([section, items]) => (
                <div key={section ?? '—'}>
                  {section && <p className="text-[11px] uppercase tracking-wide text-zinc-500 mb-1">{section}</p>}
                  <ul className="border border-zinc-800/70 rounded divide-y divide-zinc-800/70">
                    {placeSets(items).map((p) =>
                      p.kind === 'item' ? (
                        <Line key={p.row.id} e={p.row} byId={byId} />
                      ) : (
                        <li key={p.rows[0].id} className="px-3 py-2">
                          <div className="rounded border border-pr-red/40 bg-pr-red/[0.04] px-2.5 py-2">
                            <p className="text-[11px] uppercase tracking-wide text-pr-red mb-1.5">
                              {isChoice(p) ? 'Bring one of' : 'Bring both'}
                            </p>
                            <ul className="space-y-1">
                              {p.rows.map((r) => <Line key={r.id} e={r} byId={byId} bare />)}
                            </ul>
                          </div>
                        </li>
                      )
                    )}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function Line({
  e, byId, bare,
}: {
  e: GearTemplate['gear_list_entries'][number]
  byId: Map<string, CatalogItem>
  bare?: boolean
}) {
  const item = e.gear_item_id ? byId.get(e.gear_item_id) : undefined
  const name = e.name ?? (item ? productName(item) : null) ?? 'Item'
  const url = e.url ?? item?.url
  const { detail } = gearLabel(
    name,
    [...(e.gear_entry_options ?? [])]
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((o) => byId.get(o.gear_item_id ?? ''))
      .filter(Boolean)
      .map((g) => ({ name: productName(g!) }))
  )
  // No course behind a template, so there is no total to work out — the rule
  // itself is the honest thing to print. lib/gear says the same in more words.
  const qty = gearQuantity(e, { students: null, view: 'course' })

  return (
    <li className={bare ? 'text-sm' : 'px-3 py-2 text-sm'}>
      <div className="flex items-center gap-2 flex-wrap">
        {url ? (
          <a href={url} target="_blank" rel="noreferrer" className="hover:text-pr-red-light transition-colors">{name}</a>
        ) : name}
        {detail && <span className="text-xs text-zinc-400">{detail}</span>}
        {(qty.rule ?? qty.text) && <span className="text-[11px] text-zinc-500">{qty.rule ?? qty.text}</span>}
      </div>
      {e.note && <p className="text-[11px] text-zinc-500 mt-0.5">{e.note}</p>}
    </li>
  )
}

function ScheduleBody({ schedule }: { schedule: ScheduleTemplate }) {
  const days = [...(schedule.schedule_days ?? [])].sort((a, b) => a.sort_order - b.sort_order)
  if (days.length === 0) return <p className="text-sm text-zinc-500">No days on this schedule yet.</p>

  return (
    <div className="space-y-4">
      {schedule.overview && <p className="text-sm text-zinc-400">{schedule.overview}</p>}
      {days.map((d, i) => {
        const blocks = [...(d.schedule_blocks ?? [])].sort((a, b) => a.sort_order - b.sort_order)
        const top = blocks.filter((b) => !b.parent_id)
        return (
          <div key={d.id}>
            <h4 className="text-[13px] font-medium text-zinc-300">
              Day {i + 1}
              {d.title && <span className="text-zinc-400 font-normal"> · {d.title}</span>}
              {d.location && <span className="text-zinc-600 font-normal"> · {d.location}</span>}
            </h4>
            {d.objectives?.length > 0 && (
              <ul className="mt-1 text-[11px] text-zinc-500 list-disc pl-5">
                {d.objectives.map((o, n) => <li key={n}>{o}</li>)}
              </ul>
            )}
            {top.length > 0 && (
              <ul className="mt-1.5 ml-0.5 pl-3 border-l-2 border-zinc-800 space-y-1">
                {top.map((b) => (
                  <li key={b.id} className="text-sm">
                    <span className="flex items-center gap-2 flex-wrap">
                      {b.time_label && <span className="text-[11px] text-zinc-500 tabular-nums">{b.time_label}</span>}
                      <span>{b.title}</span>
                      {b.location && <span className="text-[11px] text-zinc-600">{b.location}</span>}
                    </span>
                    {blocks.filter((c) => c.parent_id === b.id).length > 0 && (
                      <ul className="mt-0.5 pl-4 text-[13px] text-zinc-400 list-disc">
                        {blocks.filter((c) => c.parent_id === b.id).map((c) => <li key={c.id}>{c.title}</li>)}
                      </ul>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {d.notes && <p className="text-[11px] text-zinc-600 mt-1">{d.notes}</p>}
          </div>
        )
      })}
    </div>
  )
}
