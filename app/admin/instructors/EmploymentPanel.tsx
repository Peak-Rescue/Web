'use client'

import { useState } from 'react'
import InfoHint from '@/components/InfoHint'
import { adminSetSalaried, adminSetAnnualSalary, adminSetPaidForDays } from './[id]/actions'

// How somebody is paid — three questions, on one line each, because the crew
// answers them in every combination there is:
//
//   · Salaried, and how much. The amount sits on the same line, being the
//     rest of that sentence, and is only asked once the answer is yes. It is
//     overhead — no course's actuals read it — and is kept so the org's own
//     P&L has a figure to read rather than one in somebody's head.
//   · Whether the field and travel days they work are paid on top. What a
//     course's pay lines read. Micah and Cody are salaried and not paid for
//     course days; Eric, Toph and Nadav are salaried and paid for them.
//   · FLSA exempt, beside them rather than derived from them: three of the
//     salaried crew earn time and a half past forty hours, and one does not.
//     It also decides who can claim covered meals without receipts, which is
//     why it lives on the account.
//
// What they are paid an hour is deliberately not here: that depends on the
// role and the course type, so it is checked on each course's pay rows.

const ROW = 'flex items-center justify-between gap-4 px-4 py-3 bg-zinc-900 border border-zinc-800 rounded-lg flex-wrap'
const PILL = 'px-3 py-1.5 rounded text-xs font-medium transition-colors disabled:opacity-50'
const ON = 'bg-teal-700 hover:bg-teal-600 text-white'
const OFF = 'bg-zinc-700 hover:bg-zinc-600 text-zinc-300'

export default function EmploymentPanel({
  instructorId,
  salaried: initialSalaried,
  annualSalary: initialSalary,
  paidForDays: initialPaid,
  exemptToggle,
}: {
  instructorId: string
  salaried: boolean
  annualSalary: number | null
  paidForDays: boolean
  /** The account's FLSA toggle, rendered by the page because it is keyed on
      the profile and there is not always one. Passed in so the three
      questions are one block on screen rather than a block and a stray. */
  exemptToggle?: React.ReactNode
}) {
  const [salaried, setSalaried] = useState(initialSalaried)
  const [salary, setSalary] = useState(initialSalary === null ? '' : String(initialSalary))
  const [savedSalary, setSavedSalary] = useState(initialSalary === null ? '' : String(initialSalary))
  const [paidForDays, setPaidForDays] = useState(initialPaid)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function run(work: () => Promise<void>) {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      await work()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save that')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-2">
      {error && <p className="text-xs text-pr-red-light">{error}</p>}

      <div className={ROW}>
        <div className="flex items-center gap-1.5">
          <p className="text-sm font-medium">Salaried</p>
          <InfoHint text="Being on a salary is what FLSA exempt meant here, so it carries both: covered meals without receipts on an expense report, and no overtime premium on course hours. The amount is overhead — no course's actuals read it — and is kept for the org's own profit and loss." />
        </div>
        <div className="flex items-center gap-2">
          {/* The amount is the rest of the same sentence, so it sits on the
              same line — and there is nothing to ask until the answer is
              yes. */}
          {salaried && (
            <>
              <span className="text-sm text-zinc-500">$</span>
              <input
                value={salary}
                onChange={(e) => setSalary(e.target.value)}
                onBlur={() => {
                  const trimmed = salary.replace(/[$,\s]/g, '')
                  if (trimmed === savedSalary.replace(/[$,\s]/g, '')) return
                  void run(async () => {
                    await adminSetAnnualSalary(instructorId, trimmed === '' ? null : Number(trimmed))
                    setSavedSalary(trimmed)
                  })
                }}
                inputMode="decimal"
                placeholder="a year"
                title="What the salary is, a year"
                className="w-28 bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-sm text-right focus:outline-none focus:border-zinc-500 placeholder-zinc-600"
              />
            </>
          )}
          <button
            onClick={() => run(async () => {
              await adminSetSalaried(instructorId, !salaried)
              setSalaried(!salaried)
            })}
            disabled={busy}
            className={`${PILL} ${salaried ? ON : OFF}`}
          >
            {salaried ? 'Salaried' : 'Not salaried'}
          </button>
        </div>
      </div>

      <div className={ROW}>
        <div className="flex items-center gap-1.5">
          <p className="text-sm font-medium">Paid for field &amp; travel days</p>
          <InfoHint text="Whether the days they work on a course are paid on top of anything else, at an hourly checked on that course. Off makes their course pay nothing and stops the pay panel asking for a rate — their hours are still shown." />
        </div>
        <button
          onClick={() => run(async () => {
            await adminSetPaidForDays(instructorId, !paidForDays)
            setPaidForDays(!paidForDays)
          })}
          disabled={busy}
          className={`${PILL} ${paidForDays ? ON : OFF}`}
        >
          {paidForDays ? 'Paid by the day' : 'Not paid for days'}
        </button>
      </div>

      {exemptToggle}
    </div>
  )
}
