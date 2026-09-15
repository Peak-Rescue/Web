'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { fmtMoney, fmtDateRange, round2 } from '@/lib/expenses'
import {
  accountsWorthShowing,
  expenseLineLabel,
  rollUpActuals,
  type CostAccount,
  type PayLine,
  type TypedCostLine,
} from '@/lib/actuals'
import { type LoadedActuals } from '@/lib/actuals-data'
import {
  addCostAccount,
  setActualsShared,
  addSuggestedPayLines,
  deleteCostItem,
  deletePayItem,
  saveActualsHeader,
  saveCostItem,
  savePayItem,
  setActualsClosed,
  setExpenseItemAccount,
} from '@/app/admin/courses/actuals-actions'
import TrashIcon from '@/components/TrashIcon'
import InfoHint from '@/components/InfoHint'

// What the course actually cost, next to what we actually billed.
//
// The estimator upstairs argues about what a course should cost; this is the
// part that finds out. Three sources of cost meet here and they are kept
// visibly apart, because "where did this number come from" is the question
// somebody asks six months later:
//
//   · expense reports, pulled live and never copied, so a corrected report
//     moves the net;
//   · costs typed straight on, which is most of it — the company card is not
//     expensed for reimbursement and so never passes through a report;
//   · pay, which has no source in the app at all and is therefore typed, with
//     a suggestion offered from the course's own shape.
//
// Everything auto-saves, expense-editor style: no save buttons, a status line
// per block.

const DEBOUNCE_MS = 800

// Not a category id. Picked out of the same dropdown, because the moment you
// need a new category is the moment you are looking at a cost that has no
// home, and a separate "add category" box beside the list was one more thing
// on screen for something done twice a year.
const NEW_CATEGORY = '__new__'

/** `amountText` is what is in the box while it is being typed. Without it a
    row shows the parsed number back, so "0.5" loses its zero the moment it
    is typed — the number is 0 until the 5 arrives. */
type PayRow = PayLine & { key: string; amountText?: string }
type CostRow = TypedCostLine & { key: string; amountText?: string }

export default function ActualsPanel({
  instanceId,
  actuals: loaded,
  people,
  suggestion,
  acceptedQuote,
}: {
  instanceId: string
  /** Everything as the shared loader assembled it — the same shape the
      emailed page and the PDF read, so the three cannot drift. */
  actuals: LoadedActuals
  /** The staffed crew, for attributing a pay line to a person. */
  people: { id: string; name: string }[]
  suggestion: { lines: { description: string; amount: number }[]; total: number; assumptions: string } | null
  /** Where the conversation landed. Offered as a starting point for what we
      invoiced, never as the value — gear bought for the client, an invoice
      split in two, or a renegotiation all move the real number. */
  acceptedQuote: { seq: number; total: number } | null
}) {
  const router = useRouter()
  const { accounts, expenseLines } = loaded

  const [invoiced, setInvoiced] = useState(loaded.invoiced === null ? '' : String(loaded.invoiced))
  // Blank means "follow the org number", which is what nearly every course
  // does — so the box shows the org's figure as a placeholder rather than
  // stamping a copy of it onto this course.
  const [loadPct, setLoadPct] = useState(
    loaded.payrollLoadOverride === null ? '' : String(round1(loaded.payrollLoadOverride * 100))
  )
  const [notes, setNotes] = useState(loaded.notes ?? '')
  const [closed, setClosed] = useState(Boolean(loaded.closedAt))
  const [shareToken, setShareToken] = useState(loaded.shareToken)

  // Both lists end in an empty row, always. Entering a cost was a click to
  // expand, a click to add and then the typing; this is a spreadsheet, which
  // is what it replaced and what the person doing it already has open. An
  // untouched blank never reaches the server — the save fires on change — so
  // the row costs nothing to keep on screen.
  const [pay, setPay] = useState<PayRow[]>(withBlankPay(loaded.payLines.map((l) => ({ ...l, key: l.id }))))
  const [costs, setCosts] = useState<CostRow[]>(withBlankCost(loaded.costLines.map((l) => ({ ...l, key: l.id }))))
  const [overrides, setOverrides] = useState<Map<string, string>>(new Map(loaded.expenseAccounts))
  const [openAccount, setOpenAccount] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>())
  const chains = useRef(new Map<string, Promise<unknown>>())
  // Server ids for rows added in this session, so the second save of a new
  // row updates the first save's row instead of inserting a second one. The
  // id cannot be read off state here: a save fired while the previous one is
  // still in flight would see the id state had before it landed.
  const ids = useRef(new Map<string, string>())

  // One debounce per thing being edited, keyed so typing in two rows does not
  // make one cancel the other's save — and one queue per key behind it, so a
  // fast typist on a brand-new row cannot have two inserts in flight at once.
  function schedule(key: string, run: () => Promise<unknown>) {
    const existing = timers.current.get(key)
    if (existing) clearTimeout(existing)
    timers.current.set(
      key,
      setTimeout(() => {
        timers.current.delete(key)
        const previous = chains.current.get(key) ?? Promise.resolve()
        const next = previous
          .catch(() => {})
          .then(run)
          .then(() => setError(null))
          .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Could not save that'))
        chains.current.set(key, next)
      }, DEBOUNCE_MS)
    )
  }

  const actuals = rollUpActuals({
    accounts,
    expenseLines,
    expenseAccountOverrides: overrides,
    typedLines: costs,
    payLines: pay,
    payrollLoadPct: loadPct.trim() === '' ? loaded.orgPayrollLoad : (Number(loadPct) || 0) / 100,
    invoiced: Number(String(invoiced).replace(/[$,\s]/g, '')) || 0,
  })

  function saveHeader(next?: { invoiced?: string; loadPct?: string; notes?: string }) {
    const pct = next?.loadPct ?? loadPct
    const payload = {
      invoiced: next?.invoiced ?? invoiced,
      // Null rather than a number: this course follows the org, and copying
      // the org's figure in would freeze it here the day the org's changes.
      payrollLoadPct: pct.trim() === '' ? null : (Number(pct) || 0) / 100,
      notes: next?.notes ?? notes,
    }
    schedule('header', () => saveActualsHeader(instanceId, payload))
  }

  function updatePay(key: string, patch: Partial<PayRow>) {
    setPay((rows) => {
      const next = withBlankPay(rows.map((r) => (r.key === key ? { ...r, ...patch } : r)))
      const row = next.find((r) => r.key === key)!
      schedule(`pay:${key}`, async () => {
        const known = row.id || ids.current.get(key) || null
        const saved = await savePayItem(instanceId, known, {
          profile_id: row.profile_id,
          work_date: row.work_date,
          description: row.description,
          amount: String(row.amount),
        })
        if (!known) {
          ids.current.set(key, saved.id)
          setPay((rs) => rs.map((r) => (r.key === key ? { ...r, id: saved.id } : r)))
        }
      })
      return next
    })
  }

  function updateCost(key: string, patch: Partial<CostRow>) {
    setCosts((rows) => {
      const next = withBlankCost(rows.map((r) => (r.key === key ? { ...r, ...patch } : r)))
      const row = next.find((r) => r.key === key)!
      schedule(`cost:${key}`, async () => {
        const known = row.id || ids.current.get(key) || null
        const saved = await saveCostItem(instanceId, known, {
          account_id: row.account_id,
          spend_date: row.spend_date,
          description: row.description,
          amount: String(row.amount),
        })
        if (!known) {
          ids.current.set(key, saved.id)
          setCosts((rs) => rs.map((r) => (r.key === key ? { ...r, id: saved.id } : r)))
        }
      })
      return next
    })
  }

  // A row deleted while its own save is still queued: let the queue drain
  // first and then delete what it created, or the insert lands after the
  // delete and leaves a line nobody can see.
  async function settle(key: string) {
    const timer = timers.current.get(key)
    if (timer) clearTimeout(timer)
    timers.current.delete(key)
    await (chains.current.get(key) ?? Promise.resolve()).catch(() => {})
  }

  async function removePay(row: PayRow) {
    setPay((rs) => withBlankPay(rs.filter((r) => r.key !== row.key)))
    await settle(`pay:${row.key}`)
    const id = row.id || ids.current.get(row.key)
    if (id) await deletePayItem(instanceId, id).catch(() => router.refresh())
  }

  async function removeCost(row: CostRow) {
    setCosts((rs) => withBlankCost(rs.filter((r) => r.key !== row.key)))
    await settle(`cost:${row.key}`)
    const id = row.id || ids.current.get(row.key)
    if (id) await deleteCostItem(instanceId, id).catch(() => router.refresh())
  }

  /** A category invented while typing the cost that needed it, which is the
      only moment anybody wants one. Returns its id so the row that asked can
      assign itself to it. */
  async function createCategory(): Promise<string | null> {
    const name = window.prompt('New cost category')?.trim()
    if (!name) return null
    setBusy(true)
    try {
      const { id } = await addCostAccount(instanceId, name)
      router.refresh()
      return id
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not add that category')
      return null
    } finally {
      setBusy(false)
    }
  }

  async function fileExpense(itemId: string, accountId: string) {
    setOverrides((m) => {
      const next = new Map(m)
      if (accountId) next.set(itemId, accountId)
      else next.delete(itemId)
      return next
    })
    await setExpenseItemAccount(instanceId, itemId, accountId || null).catch((e: unknown) =>
      setError(e instanceof Error ? e.message : 'Could not move that expense')
    )
  }

  const liveAccounts = accountsWorthShowing(actuals.accounts)

  // The part of the uncategorised pile that came from the list above rather
  // than from an expense report whose category was retired.
  const unfiledTyped = round2(
    actuals.unfiled.amount - actuals.unfiled.lines.reduce((t, l) => t + l.amount, 0)
  )

  const input = 'bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-sm text-white focus:outline-none focus:border-zinc-500'
  const cell = 'text-sm text-zinc-300'

  return (
    <div className="space-y-6">
      {error && (
        <p className="text-xs text-pr-red-light">{error} — the last change may not have been kept.</p>
      )}

      {/* ── What we billed ───────────────────────────────────────────────── */}
      <div>
        <div className="flex items-baseline gap-2 mb-2">
          <h4 className="text-sm font-semibold text-zinc-200">Invoiced</h4>
          <InfoHint text="What we actually billed, which is not always the quote they accepted." />
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-1.5">
            <span className="text-zinc-500 text-sm">$</span>
            <input
              value={invoiced}
              onChange={(e) => {
                setInvoiced(e.target.value)
                saveHeader({ invoiced: e.target.value })
              }}
              inputMode="decimal"
              placeholder="0.00"
              className={`${input} w-32 text-right`}
            />
          </div>
          {acceptedQuote && (
            <span className="text-xs text-zinc-500">
              Quote {acceptedQuote.seq} was accepted at {fmtMoney(acceptedQuote.total)}
              {Math.abs(actuals.invoiced - acceptedQuote.total) > 0.005 && (
                <button
                  onClick={() => {
                    setInvoiced(String(acceptedQuote.total))
                    saveHeader({ invoiced: String(acceptedQuote.total) })
                  }}
                  className="ml-2 text-zinc-400 hover:text-white underline underline-offset-2 transition-colors"
                >
                  use it
                </button>
              )}
            </span>
          )}
        </div>
      </div>

      {/* ── Pay ──────────────────────────────────────────────────────────── */}
      <div>
        <div className="flex items-baseline gap-2 mb-2">
          <h4 className="text-sm font-semibold text-zinc-200">Pay</h4>
          <InfoHint text="Hours live in ADP, not here, so pay is typed. Any suggestion comes from the course's length and the library's pay rates." />
        </div>

        {suggestion && pay.every(payIsBlank) && (
          <div className="mb-3 p-3 rounded border border-zinc-800 bg-zinc-900/60">
            <p className="text-xs text-zinc-400">
              Suggested <span className="text-zinc-200 font-medium">{fmtMoney(suggestion.total)}</span>
              {' · '}{suggestion.assumptions}
            </p>
            <button
              disabled={busy}
              onClick={async () => {
                setBusy(true)
                try {
                  await addSuggestedPayLines(instanceId, suggestion.lines)
                  router.refresh()
                } catch (e) {
                  setError(e instanceof Error ? e.message : 'Could not add those lines')
                } finally {
                  setBusy(false)
                }
              }}
              className="mt-2 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 rounded text-xs font-medium transition-colors disabled:opacity-50"
            >
              Add as pay lines
            </button>
          </div>
        )}

        <div className="space-y-1.5">
          {pay.map((row) => (
            <div key={row.key} className="flex items-center gap-2 flex-wrap">
              <select
                value={row.profile_id ?? ''}
                onChange={(e) => updatePay(row.key, { profile_id: e.target.value || null })}
                className={`${input} w-40`}
              >
                <option value="">— whole crew —</option>
                {people.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
              <input
                type="date"
                value={row.work_date ?? ''}
                onChange={(e) => updatePay(row.key, { work_date: e.target.value || null })}
                className={`${input} w-36`}
              />
              <input
                value={row.description ?? ''}
                onChange={(e) => updatePay(row.key, { description: e.target.value })}
                placeholder="What for"
                className={`${input} flex-1 min-w-40`}
              />
              <input
                value={amountValue(row)}
                onChange={(e) => updatePay(row.key, { amountText: e.target.value, amount: parseAmount(e.target.value) })}
                inputMode="decimal"
                placeholder="0.00"
                className={`${input} w-24 text-right placeholder-zinc-600`}
              />
              {/* Nothing to remove from a row nobody has typed in yet. */}
              {payIsBlank(row) ? (
                <span className="w-4" />
              ) : (
                <button onClick={() => void removePay(row)} className="text-zinc-600 hover:text-pr-red-light transition-colors" title="Remove">
                  <TrashIcon className="w-4 h-4" />
                </button>
              )}
            </div>
          ))}
        </div>

        <div className="mt-3 pt-3 border-t border-zinc-800 space-y-1 text-sm">
          <Row label="Pay total" value={fmtMoney(actuals.payTotal)} />
          <div className="flex items-center justify-between gap-4">
            <span className="text-zinc-400 flex items-center gap-1.5 flex-wrap">
              Payroll load
              <input
                value={loadPct}
                onChange={(e) => {
                  setLoadPct(e.target.value)
                  saveHeader({ loadPct: e.target.value })
                }}
                inputMode="decimal"
                placeholder={String(round1(loaded.orgPayrollLoad * 100))}
                title="Blank follows the org-wide number"
                className={`${input} w-14 text-right placeholder-zinc-500`}
              />
              %
              {loadPct.trim() === '' ? (
                <span className="text-xs text-zinc-600">org-wide</span>
              ) : (
                <button
                  onClick={() => {
                    setLoadPct('')
                    saveHeader({ loadPct: '' })
                  }}
                  className="text-xs text-zinc-500 hover:text-zinc-300 underline underline-offset-2 transition-colors"
                >
                  use the org-wide {round1(loaded.orgPayrollLoad * 100)}%
                </button>
              )}
            </span>
            <span className={cell}>{fmtMoney(actuals.payrollLoad)}</span>
          </div>
          <Row label="Instructor pay" value={fmtMoney(actuals.instructorPay)} strong />
        </div>
      </div>

      {/* ── Costs ────────────────────────────────────────────────────────── */}
      {/* Two different jobs, so two different lists.
 
          What you type is the work: every one of them visible at once, in a
          flat list you can read down, ending in an empty row. Grouping these
          under collapsed category headings meant hunting for where to type,
          then expanding, then clicking add — three clicks before the first
          keystroke, for the one part of this screen that is pure data entry.
 
          The categories are the answer, not the work: totals, with the
          expense-report lines behind them a caret away. Nothing is in both
          lists — a typed cost shows its category on its own row.
 
          "Category" here is the DB's cost_account. The books call it an
          account and the schema keeps that word; on screen it is a category,
          because the person filling this in is sorting costs into buckets,
          not keeping a ledger. */}
      <div>
        <div className="flex items-baseline gap-2 mb-2">
          <h4 className="text-sm font-semibold text-zinc-200">Costs</h4>
          <InfoHint text="Type what the company card and direct invoices paid for; submitted expense reports arrive on their own. Categories are shared by every course — rename or retire them on the rates page." />
        </div>

        <div className="space-y-1.5">
          {costs.map((row) => (
            <CostRowFields
              key={row.key}
              row={row}
              accounts={accounts}
              input={input}
              blank={costIsBlank(row)}
              onNewCategory={createCategory}
              onChange={(p) => updateCost(row.key, p)}
              onRemove={() => void removeCost(row)}
            />
          ))}
        </div>

        {/* ── What it all adds up to ───────────────────────────────────────
            Only the categories with something in them. The full chart is one
            click away in any row's dropdown; printed down the screen as eight
            rows of $0.00 it was a table of contents for an empty book. */}
        <div className={liveAccounts.length > 0 || actuals.unfiled.amount > 0 ? 'mt-5 border border-zinc-800 rounded divide-y divide-zinc-800' : ''}>
          {liveAccounts.map((r) => {
            const open = openAccount === r.account.id
            return (
              <div key={r.account.id}>
                <button
                  onClick={() => setOpenAccount(open ? null : r.account.id)}
                  className="w-full flex items-center justify-between gap-4 px-3 py-2 hover:bg-zinc-900/60 transition-colors text-left"
                >
                  <span className="text-sm text-zinc-300">
                    {r.account.label}
                    {r.expenseLines.length > 0 && (
                      <span className="ml-2 text-xs text-zinc-500">
                        {fmtMoney(r.fromExpenses)} of it from {r.expenseLines.length} expense line
                        {r.expenseLines.length === 1 ? '' : 's'}
                      </span>
                    )}
                  </span>
                  <span className="flex items-center gap-2 shrink-0">
                    <span className={`text-sm ${r.total > 0 ? 'text-zinc-200' : 'text-zinc-600'}`}>{fmtMoney(r.total)}</span>
                    <span className="text-zinc-600 text-xs">{open ? '▴' : '▾'}</span>
                  </span>
                </button>

                {open && (
                  <div className="px-3 pb-3 space-y-2 bg-zinc-950/40">
                    {r.expenseLines.map((l) => (
                      <div key={l.id} className="flex items-center gap-2 flex-wrap text-xs">
                        <span className="text-zinc-500 w-24 shrink-0">{fmtDateRange(l.start_date, null)}</span>
                        <span className="text-zinc-300 flex-1 min-w-32 truncate">
                          {expenseLineLabel(l)}
                          {l.personName ? <span className="text-zinc-500"> · {l.personName}</span> : null}
                          {l.paid_by === 'company_card' ? <span className="text-zinc-500"> · card</span> : null}
                        </span>
                        <span className="text-zinc-300 w-20 text-right">{fmtMoney(l.amount)}</span>
                        {/* Reported by an instructor, sorted by a bookkeeper —
                            moving it here never edits their report. */}
                        <select
                          value={overrides.get(l.id) ?? r.account.id}
                          onChange={(e) => void fileExpense(l.id, e.target.value)}
                          className="bg-zinc-800 border border-zinc-700 rounded px-1.5 py-0.5 text-xs text-zinc-300"
                          title="Move this expense to another category"
                        >
                          {accounts.map((a) => (
                            <option key={a.id} value={a.id}>{a.label}</option>
                          ))}
                        </select>
                      </div>
                    ))}

                    {r.typedLines.length > 0 && (
                      <p className="text-xs text-zinc-500">
                        {fmtMoney(r.typed)} typed above, on {r.typedLines.length} line
                        {r.typedLines.length === 1 ? '' : 's'}.
                      </p>
                    )}

                  </div>
                )}
              </div>
            )
          })}

          {/* Expense money whose category was retired out from under it.
              Counted in the total — it was spent either way — and called out,
              because only a person can say where it should have gone. */}
          {actuals.unfiled.amount > 0 && (
            <div className="px-3 py-2 space-y-2">
              <div className="flex items-center justify-between gap-4">
                <span className="text-sm text-amber-400/90">Needs a category</span>
                <span className="text-sm text-zinc-200">{fmtMoney(actuals.unfiled.amount)}</span>
              </div>
              {actuals.unfiled.lines.map((l) => (
                <div key={l.id} className="flex items-center gap-2 flex-wrap text-xs">
                  <span className="text-zinc-500 w-24 shrink-0">{fmtDateRange(l.start_date, null)}</span>
                  <span className="text-zinc-300 flex-1 min-w-32 truncate">{expenseLineLabel(l)}</span>
                  <span className="text-zinc-300 w-20 text-right">{fmtMoney(l.amount)}</span>
                  <select
                    value=""
                    onChange={(e) => void fileExpense(l.id, e.target.value)}
                    className="bg-zinc-800 border border-zinc-700 rounded px-1.5 py-0.5 text-xs text-zinc-300"
                  >
                    <option value="">— pick one —</option>
                    {accounts.map((a) => (
                      <option key={a.id} value={a.id}>{a.label}</option>
                    ))}
                  </select>
                </div>
              ))}
              {/* Typed costs land in the list above, where they are fixed.
                  Named here too so the categories still add up to the total —
                  a summary that quietly omits money is worse than none. */}
              {unfiledTyped > 0 && (
                <p className="text-xs text-zinc-500">
                  {fmtMoney(unfiledTyped)} of that is typed above, with no category picked yet.
                </p>
              )}
            </div>
          )}
        </div>

        {actuals.pending.amount > 0 && (
          <p className="mt-3 text-xs text-amber-400/90">
            {fmtMoney(actuals.pending.amount)} across {actuals.pending.lines.length} expense line
            {actuals.pending.lines.length === 1 ? '' : 's'} is still in draft, and not counted.
          </p>
        )}
      </div>

      {/* ── What it left ─────────────────────────────────────────────────── */}
      <div className="pt-4 border-t border-zinc-800 space-y-1">
        <Row label="Invoiced" value={fmtMoney(actuals.invoiced)} />
        <Row label="Costs" value={fmtMoney(actuals.costsTotal)} />
        <div className="flex items-center justify-between gap-4 pt-1">
          <span className="text-sm font-semibold text-zinc-200">Net</span>
          <span className={`text-base font-semibold ${actuals.net < 0 ? 'text-pr-red-light' : 'text-emerald-400'}`}>
            {fmtMoney(actuals.net)}
            {actuals.netPct !== null && (
              <span className="ml-2 text-xs font-normal text-zinc-500">{(actuals.netPct * 100).toFixed(2)}%</span>
            )}
          </span>
        </div>
      </div>

      {/* ── Sending it out ───────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 flex-wrap text-xs">
        <a
          href={`/api/actuals/${instanceId}/pdf`}
          target="_blank"
          rel="noreferrer"
          className="px-2.5 py-1 bg-zinc-800 hover:bg-zinc-700 rounded font-medium text-zinc-200 transition-colors"
        >
          Download PDF
        </a>
        {shareToken ? (
          <>
            <input
              readOnly
              value={shareUrl(shareToken)}
              onFocus={(e) => e.currentTarget.select()}
              className={`${input} flex-1 min-w-52 text-zinc-400`}
            />
            <button
              disabled={busy}
              onClick={async () => {
                setBusy(true)
                try {
                  await setActualsShared(instanceId, false)
                  setShareToken(null)
                } catch (e) {
                  setError(e instanceof Error ? e.message : 'Could not revoke the link')
                } finally {
                  setBusy(false)
                }
              }}
              className="text-zinc-500 hover:text-pr-red-light transition-colors"
            >
              Revoke link
            </button>
          </>
        ) : (
          <button
            disabled={busy}
            onClick={async () => {
              setBusy(true)
              try {
                setShareToken(await setActualsShared(instanceId, true))
              } catch (e) {
                setError(e instanceof Error ? e.message : 'Could not make a link')
              } finally {
                setBusy(false)
              }
            }}
            className="px-2.5 py-1 bg-zinc-800 hover:bg-zinc-700 rounded font-medium text-zinc-200 transition-colors disabled:opacity-50"
          >
            Make a link to send
          </button>
        )}
        <InfoHint text="Anyone with the link can read these numbers without signing in. Revoking it is immediate." />
      </div>

      <div>
        <textarea
          value={notes}
          onChange={(e) => {
            setNotes(e.target.value)
            saveHeader({ notes: e.target.value })
          }}
          rows={2}
          placeholder="Notes on this course's numbers"
          className={`${input} w-full`}
        />
        <label className="flex items-center gap-2 mt-2 text-xs text-zinc-400">
          <input
            type="checkbox"
            checked={closed}
            onChange={async (e) => {
              setClosed(e.target.checked)
              await setActualsClosed(instanceId, e.target.checked).catch(() => router.refresh())
            }}
            className="accent-red-600"
          />
          The books on this course are done
          <InfoHint text="Locks nothing — it tells the year's totals which courses have stopped moving." />
        </label>
      </div>
    </div>
  )
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className={strong ? 'text-sm font-medium text-zinc-200' : 'text-sm text-zinc-400'}>{label}</span>
      <span className={strong ? 'text-sm font-medium text-zinc-100' : 'text-sm text-zinc-300'}>{value}</span>
    </div>
  )
}

// One typed cost. Identical fields wherever it appears — under its account, or
// in the not-filed pile — because a cost in the wrong place has to read like
// the ones it belongs beside or it looks like a different kind of thing.
function CostRowFields({
  row,
  accounts,
  input,
  blank,
  onNewCategory,
  onChange,
  onRemove,
}: {
  row: CostRow & { key: string }
  accounts: CostAccount[]
  input: string
  /** Nothing typed yet, so nothing to remove. */
  blank?: boolean
  /** Invents a category and returns its id, for the row that needed one. */
  onNewCategory: () => Promise<string | null>
  onChange: (patch: Partial<CostRow>) => void
  onRemove: () => void
}) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <input
        type="date"
        value={row.spend_date ?? ''}
        onChange={(e) => onChange({ spend_date: e.target.value || null })}
        className={`${input} w-36`}
      />
      <input
        value={row.description ?? ''}
        onChange={(e) => onChange({ description: e.target.value })}
        placeholder="What it was"
        className={`${input} flex-1 min-w-32`}
      />
      {/* The whole chart, plus a way to add to it. Inventing a category is
          something you do while typing the cost that needed one, so it lives
          here rather than as a second pair of controls under the list. */}
      <select
        value={row.account_id ?? ''}
        onChange={async (e) => {
          if (e.target.value !== NEW_CATEGORY) {
            onChange({ account_id: e.target.value || null })
            return
          }
          const id = await onNewCategory()
          if (id) onChange({ account_id: id })
        }}
        className={`${input} w-36`}
      >
        <option value="">— category —</option>
        {accounts.map((a) => (
          <option key={a.id} value={a.id}>{a.label}</option>
        ))}
        <option value={NEW_CATEGORY}>+ New category…</option>
      </select>
      <input
        value={amountValue(row)}
        onChange={(e) => onChange({ amountText: e.target.value, amount: Number(e.target.value.replace(/[$,\s]/g, '')) || 0 })}
        inputMode="decimal"
        placeholder="0.00"
        className={`${input} w-24 text-right placeholder-zinc-600`}
      />
      {blank ? (
        <span className="w-4" />
      ) : (
        <button onClick={onRemove} className="text-zinc-600 hover:text-pr-red-light transition-colors" title="Remove">
          <TrashIcon className="w-4 h-4" />
        </button>
      )}
    </div>
  )
}

function round1(n: number): number {
  return Math.round(n * 10) / 10
}

// Absolute, because the point of it is to be pasted into an email. Read off
// the browser rather than threaded down from the server: this only ever runs
// after a click, and the origin the admin is looking at is the right one.
function shareUrl(token: string): string {
  const origin = typeof window === 'undefined' ? '' : window.location.origin
  return `${origin}/actuals/${token}`
}

// An untouched row: nothing typed, nothing saved, nothing to lose by keeping
// it on screen. One of these always sits at the end of each list so entering
// the next line is typing rather than clicking.
function payIsBlank(r: PayRow): boolean {
  return !r.id && !r.description?.trim() && !r.amount && !r.amountText?.trim() && !r.profile_id && !r.work_date
}

function costIsBlank(r: CostRow): boolean {
  return !r.id && !r.description?.trim() && !r.amount && !r.amountText?.trim() && !r.account_id && !r.spend_date
}

/** What to show in an amount box: the text being typed, the saved number, or
    nothing at all — never a 0 sitting in an empty row looking like an entry
    somebody made. */
export function amountValue(row: { amount: number; amountText?: string }): string {
  if (row.amountText !== undefined) return row.amountText
  return row.amount ? String(row.amount) : ''
}

function parseAmount(text: string): number {
  return Number(text.replace(/[$,\s]/g, '')) || 0
}

function withBlankPay(rows: PayRow[]): PayRow[] {
  if (rows.some(payIsBlank)) return rows
  return [...rows, { key: newKey(), id: '', profile_id: null, work_date: null, description: null, amount: 0 }]
}

function withBlankCost(rows: CostRow[]): CostRow[] {
  if (rows.some(costIsBlank)) return rows
  return [...rows, { key: newKey(), id: '', account_id: null, spend_date: null, description: null, amount: 0 }]
}

// A row's identity before the server has given it one. Only has to be unique
// within this panel for as long as it is open.
let keySeq = 0
function newKey(): string {
  keySeq += 1
  return `new-${keySeq}`
}
