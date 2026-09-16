'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import CoursePicker, { type CourseOption } from '@/components/CoursePicker'
import { fmtMoney } from '@/lib/expenses'
import { tagCharge, tagChargesLike } from './actions'

// Saying what each charge was for.
//
// A row leaves this list the moment it is answered, because the list is the
// work remaining and a row that has been dealt with is not work. It goes with
// an undo rather than a confirmation: answering forty charges cannot afford a
// dialog each, and the cost of a wrong answer is one click to take back.
//
// Two answers count as an answer. A course, or "overhead" — rent, software, a
// tool for the shop. Silence is the third state and it is what keeps a row
// here, which is the whole point: money nobody has classified must not quietly
// resolve to nobody's problem.

export type ChargeRow = {
  id: string
  posted_date: string
  description: string
  amount: number
  cardholder: string | null
  account_id: string | null
}

const BOX = 'bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-zinc-500'

export default function ChargeTagger({
  charges,
  courses,
  accounts,
}: {
  charges: ChargeRow[]
  courses: CourseOption[]
  accounts: { id: string; label: string }[]
}) {
  const router = useRouter()
  const [rows, setRows] = useState(charges)
  const [category, setCategory] = useState<Map<string, string>>(
    new Map(charges.filter((c) => c.account_id).map((c) => [c.id, c.account_id as string]))
  )
  const [filed, setFiled] = useState<{ row: ChargeRow; where: string; also: number } | null>(null)
  // Rows whose next answer speaks for every charge from the same merchant.
  // Armed before answering rather than offered after, because the answer is a
  // course picked from a list and a confirmation on top of it would be a
  // second decision about something already decided.
  const [spreads, setSpreads] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)

  // Charges the same merchant made that nobody has answered for yet. A card
  // statement repeats itself — nine nights at one hotel is nine rows — and
  // tagging them one at a time is why statements go untagged.
  const likeCount = (row: ChargeRow) =>
    rows.filter((r) => r.id !== row.id && r.description.toLowerCase() === row.description.toLowerCase()).length

  async function file(row: ChargeRow, to: { instanceId: string | null; nonCourse: boolean }, all: boolean) {
    const accountId = category.get(row.id) ?? null
    const others = all ? rows.filter((r) => r.description.toLowerCase() === row.description.toLowerCase()) : [row]
    setRows((rs) => rs.filter((r) => !others.some((o) => o.id === r.id)))
    setError(null)
    try {
      const alsoFiled = all
        ? (await tagChargesLike(row.description, { ...to, accountId })) - 1
        : (await tagCharge(row.id, { ...to, accountId }), 0)
      setFiled({
        row,
        where: to.instanceId ? (courses.find((c) => c.id === to.instanceId)?.label ?? 'that course') : 'overhead',
        also: Math.max(alsoFiled, 0),
      })
      router.refresh()
    } catch (e) {
      // Put it back: the list is the work remaining, and a row that did not
      // save is still work.
      setRows((rs) => [...others, ...rs].sort((a, b) => a.posted_date.localeCompare(b.posted_date)))
      setError(e instanceof Error ? e.message : 'Could not file that charge')
    }
  }

  async function undo(row: ChargeRow) {
    setFiled(null)
    try {
      await tagCharge(row.id, { instanceId: null, nonCourse: false })
      setRows((rs) => [...rs, row].sort((a, b) => a.posted_date.localeCompare(b.posted_date)))
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not undo that')
    }
  }

  return (
    <div className="space-y-2">
      {error && <p className="text-xs text-pr-red-light">{error}</p>}
      {filed && (
        <p className="text-xs text-zinc-500">
          {filed.row.description} → <span className="text-zinc-300">{filed.where}</span>
          {filed.also > 0 && <> and {filed.also} like it</>}
          {filed.also === 0 && (
            <>
              {' · '}
              <button onClick={() => void undo(filed.row)} className="underline underline-offset-2 hover:text-zinc-300 transition-colors">
                undo
              </button>
            </>
          )}
        </p>
      )}

      {rows.map((row) => {
        const also = likeCount(row)
        return (
          <div key={row.id} className="border border-zinc-800 rounded px-3 py-2 flex flex-wrap items-center gap-x-3 gap-y-2">
            <span className="text-xs text-zinc-500 w-20 shrink-0">{row.posted_date}</span>
            <span className="text-sm text-zinc-200 flex-1 min-w-48 truncate" title={row.description}>
              {row.description}
              {row.cardholder && <span className="ml-2 text-xs text-zinc-600">{row.cardholder}</span>}
            </span>
            <span className={`text-sm tabular-nums w-24 text-right ${row.amount < 0 ? 'text-emerald-400' : 'text-zinc-200'}`}>
              {fmtMoney(row.amount)}
            </span>

            <select
              value={category.get(row.id) ?? ''}
              onChange={(e) =>
                setCategory((m) => {
                  const next = new Map(m)
                  if (e.target.value) next.set(row.id, e.target.value)
                  else next.delete(row.id)
                  return next
                })
              }
              className={`${BOX} w-32`}
            >
              <option value="">— category —</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label}
                </option>
              ))}
            </select>

            <div className="w-56">
              <CoursePicker
                courses={courses}
                value=""
                onChange={(id) => void file(row, { instanceId: id || null, nonCourse: false }, spreads.has(row.id))}
                noneLabel="— which course? —"
              />
            </div>

            <button
              onClick={() => void file(row, { instanceId: null, nonCourse: true }, spreads.has(row.id))}
              title="Not a course — rent, software, a tool for the shop"
              className="text-xs text-zinc-500 hover:text-zinc-200 transition-colors"
            >
              Overhead
            </button>

            {also > 0 && (
              <label
                title={`Answer for this and the other ${also} from ${row.description} at once`}
                className="text-xs text-zinc-600 hover:text-zinc-300 transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={spreads.has(row.id)}
                  onChange={(e) =>
                    setSpreads((s) => {
                      const next = new Set(s)
                      if (e.target.checked) next.add(row.id)
                      else next.delete(row.id)
                      return next
                    })
                  }
                />
                +{also} like it
              </label>
            )}
          </div>
        )
      })}
    </div>
  )
}
