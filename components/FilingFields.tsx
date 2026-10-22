'use client'

import PlaceSelect from '@/components/PlaceSelect'
import InfoHint from '@/components/InfoHint'
import OfferingChips from '@/components/OfferingChips'
import KindOptions from '@/components/KindOptions'
import { AUDIENCE_META, type Venue } from '@/lib/library'
import { CAPABILITY_META, CAPABILITY_ORDER } from '@/lib/capabilities'
import { type SiteOption } from '@/app/admin/schedules/types'

// What filing something asks, wherever it is asked.
//
// There were three editors on the library's shelves — a document's, a gear
// list's and a setup's — and each learned the questions separately, so the
// document grew a location and several offerings while the gear list kept one
// offering and no place at all. A shelf is a shelf: the thing being edited
// differs below this panel, not in it.
//
// So this is the panel, and the editors differ only in what they add
// underneath. The next field — a client to tie material to — is added here
// once and arrives on every shelf, which is the whole reason it exists.

export type FilingValue = {
  title: string
  kind: string
  course_types: string[]
  /** 'internal' | 'shared' | 'admin' in the library; 'student' | 'instructor'
      where the question is who carries the thing rather than who may see it. */
  audience: string
  place: string
  disciplines: string[]
  topicsRaw: string
}

const input =
  'w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-sm focus:outline-none focus:border-zinc-500'
const label = 'block text-[11px] text-zinc-500 mb-1'

export default function FilingFields({
  value,
  onChange,
  venues,
  sites,
  titleLabel = 'Title',
  /** A document's link, a map's link rows — whatever stands in for "the thing
      itself" on this shelf. Templates have none: their contents are below. */
  linkSlot,
  showType = true,
  audienceMode = 'library',
  audienceLabel,
  offeringsLabel,
  offeringsHint,
  placeRequired = false,
  /** Disciplines the offerings already imply. Shown ticked and held there,
      because the matching derives them anyway and an unticked box that the
      matching treats as ticked is a lie on the form. */
  lockedDisciplines = [],
  lockedFrom,
  extras,
}: {
  value: FilingValue
  onChange: (next: FilingValue, changed: keyof FilingValue) => void
  venues: Venue[]
  sites: SiteOption[]
  titleLabel?: string
  linkSlot?: React.ReactNode
  showType?: boolean
  audienceMode?: 'library' | 'carrier' | 'none'
  audienceLabel?: string
  offeringsLabel?: string
  offeringsHint?: string
  placeRequired?: boolean
  lockedDisciplines?: string[]
  lockedFrom?: string | null
  extras?: React.ReactNode
}) {
  const set = (patch: Partial<FilingValue>, changed: keyof FilingValue) =>
    onChange({ ...value, ...patch }, changed)

  return (
    <>
      <div className="sm:col-span-2">
        <label className={label}>{titleLabel}</label>
        <input
          className={input}
          value={value.title}
          onChange={(e) => set({ title: e.target.value }, 'title')}
        />
      </div>

      {linkSlot && <div className="sm:col-span-2">{linkSlot}</div>}

      {showType && (
        <div>
          {/* Picking a type has already said which shelf — it is listed under
              that shelf's name — so the shelf follows rather than being asked
              for again on the next line. */}
          <label className={label}>Type</label>
          <select
            className={input}
            value={value.kind}
            onChange={(e) => set({ kind: e.target.value }, 'kind')}
          >
            {/* Blank while nothing has been said, and gone once something has.
                A type list that offers "not said yet" as a row reads as a
                category, and people filed things under it. */}
            {value.kind === 'reference' && <option value="reference" />}
            <KindOptions />
          </select>
        </div>
      )}

      <OfferingChips
        label={offeringsLabel}
        hint={
          offeringsHint ??
          'Pick one to limit this to those courses. Left empty it is offered wherever its discipline matches, which is what most material wants.'
        }
        value={value.course_types}
        onChange={(course_types) => set({ course_types }, 'course_types')}
        className={input}
      />

      {audienceMode !== 'none' && (
        <div>
          <label className={label}>{audienceLabel ?? (audienceMode === 'carrier' ? 'Who carries it' : 'Who can see it')}</label>
          <select
            className={input}
            value={value.audience}
            onChange={(e) => set({ audience: e.target.value }, 'audience')}
          >
            {audienceMode === 'carrier' ? (
              <>
                <option value="student">Students</option>
                <option value="instructor">Instructors</option>
              </>
            ) : (
              <>
                <option value="internal">{AUDIENCE_META.internal.choice}</option>
                <option value="shared">{AUDIENCE_META.shared.choice}</option>
                {/* One ladder in the UI, two fields underneath. Admin-only is
                    stored as its own flag so it can only ever add a
                    restriction, but to the person setting it this is plainly
                    the third rung: students, then instructors, then us. */}
                <option value="admin">Admins only — and never on a course</option>
              </>
            )}
          </select>
        </div>
      )}

      {/* One question at either level — the area, or the canyon inside it. */}
      <div>
        <label className={`${label} flex items-center gap-1.5`}>
          Location{placeRequired ? ' *' : ''}
          <InfoHint text="Country, state, venue or canyon — whichever level this is true for. Everything under it inherits it, so file it as broadly as it is true." />
        </label>
        <PlaceSelect
          name="place"
          venues={venues}
          sites={sites}
          value={value.place}
          onChange={(v) => set({ place: v }, 'place')}
          required={placeRequired}
          className={input}
        />
      </div>

      {extras}

      <div className="sm:col-span-2">
        <label className={`${label} flex items-center gap-1.5`}>
          Disciplines
          {lockedFrom && (
            <InfoHint text={`Ticked and held by the ${lockedFrom} offering — the matching derives them whether or not anybody ticks them.`} />
          )}
        </label>
        <div className="flex flex-wrap gap-x-4 gap-y-1.5 p-2 bg-zinc-800/50 border border-zinc-700 rounded">
          {CAPABILITY_ORDER.map((c) => {
            const held = lockedDisciplines.includes(c)
            return (
              <label
                key={c}
                title={held && lockedFrom ? `Comes with the ${lockedFrom} offering` : undefined}
                className={`flex items-center gap-1.5 text-xs cursor-pointer ${held ? 'text-zinc-500 cursor-default' : 'text-zinc-300'}`}
              >
                <input
                  type="checkbox"
                  className="accent-red-600"
                  disabled={held}
                  checked={held || value.disciplines.includes(c)}
                  onChange={() =>
                    set(
                      {
                        disciplines: value.disciplines.includes(c)
                          ? value.disciplines.filter((x) => x !== c)
                          : [...value.disciplines, c],
                      },
                      'disciplines'
                    )
                  }
                />
                {CAPABILITY_META[c].label}
              </label>
            )
          })}
        </div>
      </div>

      <div className="sm:col-span-2">
        <label className={`${label} flex items-center gap-1.5`}>
          Topic tags
          <InfoHint text="Free text, comma separated. Searched and shown on the row; the disciplines above are what the matching reads." />
        </label>
        <input
          className={input}
          value={value.topicsRaw}
          onChange={(e) => set({ topicsRaw: e.target.value }, 'topicsRaw')}
        />
      </div>
    </>
  )
}
