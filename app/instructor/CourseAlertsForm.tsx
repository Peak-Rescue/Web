'use client'

import { useState } from 'react'
import SaveButton from '@/components/SaveButton'
import InfoHint from '@/components/InfoHint'
import { CAPABILITY_META, CAPABILITY_ORDER } from '@/lib/capabilities'

// New-course alerts, for admins — the same boxes twice.
//
// `readOnly` is how another admin's settings are shown on their instructor
// page. Deliberately this component and not a sentence summarising it: the
// question that takes you to somebody's profile is "what exactly are they set
// to", and "4 disciplines muted" doesn't answer it. Sharing the component also
// means the two views can't drift into disagreeing about what a ticked box is.
//
// Every box starts ticked and ticked means "send me this", because that is the
// only reading anybody tries first. Untick what you don't want; untick a whole
// row and the alerts stop.
//
// Two rows, because they narrow different things. Client is who we are working
// for; discipline is what the work is. Swiftwater is swiftwater on both sides
// of that line, so neither row can stand in for the other — and they are read
// together, so unticking Military drops a military canyon course even with
// Canyon still ticked.
//
// What gets saved is the boxes left *un*ticked. See the migration: a stored
// list of wanted disciplines is frozen on the day it was saved, and the twelfth
// discipline would arrive switched off for everybody who had ever opened this
// page.

const SECTORS = [
  { value: 'civilian', label: 'Civilian' },
  { value: 'military', label: 'Military' },
]

export default function CourseAlertsForm({
  action,
  mutedDisciplines,
  mutedSectors,
  readOnly,
}: {
  action?: (formData: FormData) => void | Promise<void>
  mutedDisciplines: string[]
  mutedSectors: string[]
  /** Somebody else's settings, on their instructor page. */
  readOnly?: boolean
}) {
  const [sectors, setSectors] = useState<string[]>(
    SECTORS.map((s) => s.value).filter((v) => !mutedSectors.includes(v))
  )
  const [disciplines, setDisciplines] = useState<string[]>(
    CAPABILITY_ORDER.filter((c) => !mutedDisciplines.includes(c))
  )

  const silent = sectors.length === 0 || disciplines.length === 0

  const Wrapper = readOnly ? 'div' : 'form'

  return (
    <Wrapper
      {...(readOnly ? {} : { action })}
      className="p-6 bg-zinc-900 rounded-lg border border-zinc-800"
    >
      <p className="text-sm text-zinc-300 inline-flex items-center gap-1.5">
        {readOnly ? 'Emailed when a course is created' : 'Email me when a course is created'}
        <InfoHint
          text={
            readOnly
              ? "Any status, including tentative and quoted. They choose this on their own profile — it can be read here but not changed."
              : "Any status, including tentative and quoted. Every box below starts ticked — untick anything you'd rather not hear about."
          }
        />
      </p>

      <div className="flex items-center gap-1.5 mt-6 mb-2">
        <span className="text-[11px] uppercase tracking-wide text-zinc-500">Client</span>
        <InfoHint text="Read together with the disciplines below: unticking Military drops a military canyon course even with Canyon still ticked." />
      </div>
      <div className="flex gap-2 flex-wrap">
        {SECTORS.map((s) => (
          <Toggle
            key={s.value}
            name="sectors"
            value={s.value}
            label={s.label}
            checked={sectors.includes(s.value)}
            onChange={setSectors}
            readOnly={readOnly}
          />
        ))}
      </div>

      <div className="flex items-center gap-1.5 mt-6 mb-2">
        <span className="text-[11px] uppercase tracking-wide text-zinc-500">Discipline</span>
        <InfoHint text="A course tagged with no discipline — an internal planning day — reaches you as long as you have at least one of these ticked." />
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {CAPABILITY_ORDER.map((cat) => (
          <Toggle
            key={cat}
            name="disciplines"
            value={cat}
            label={CAPABILITY_META[cat].label}
            checked={disciplines.includes(cat)}
            onChange={setDisciplines}
            readOnly={readOnly}
          />
        ))}
      </div>

      {/* Clearing a whole row is a legitimate way to switch alerts off — it is
          just also what a half-finished edit looks like, so it says so out loud
          rather than being discovered by silence three weeks later. */}
      {silent && (
        <p className="mt-4 text-xs text-amber-300">
          With {sectors.length === 0 ? 'no client' : 'no discipline'} ticked
          {readOnly ? ' they are not emailed' : ' you won\u2019t be emailed'} about any new course.
        </p>
      )}

      {!readOnly && (
        <div className="mt-6">
          <SaveButton className="px-4 py-2 bg-pr-red hover:bg-pr-red-dark text-white rounded text-sm font-medium transition-colors">
            Save
          </SaveButton>
        </div>
      )}
    </Wrapper>
  )
}

function Toggle({
  name, value, label, checked, onChange, readOnly,
}: {
  name: string
  value: string
  label: string
  checked: boolean
  onChange: (fn: (prev: string[]) => string[]) => void
  readOnly?: boolean
}) {
  return (
    <label
      className={`flex items-center gap-2 px-3 py-2 rounded border text-sm transition-colors ${
        readOnly ? 'cursor-default' : 'cursor-pointer'
      } ${
        checked
          ? 'border-teal-700 bg-teal-900/30 text-teal-200'
          : `border-zinc-800 bg-zinc-900 text-zinc-500${readOnly ? '' : ' hover:border-zinc-700'}`
      }`}
    >
      <input
        type="checkbox"
        name={name}
        value={value}
        checked={checked}
        disabled={readOnly}
        onChange={(e) =>
          onChange((prev) => (e.target.checked ? [...prev, value] : prev.filter((v) => v !== value)))
        }
        className="w-3.5 h-3.5 accent-pr-red shrink-0 disabled:opacity-70"
      />
      {label}
    </label>
  )
}
