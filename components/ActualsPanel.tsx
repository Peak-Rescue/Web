'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { fmtMoney, fmtDateRange, round2 } from '@/lib/expenses'
import {
  accountsWorthShowing,
  expenseLineLabel,
  groupByReport,
  rollUpActuals,
  type CostAccount,
  type PayLine,
  type TypedCostLine,
} from '@/lib/actuals'
import { type LoadedActuals } from '@/lib/actuals-data'
import { type ChainLink } from '@/lib/billing'
import {
  addCostAccount,
  setActualsShared,
  addSuggestedPayLines,
  deleteCostItem,
  deletePayItem,
  saveActualsHeader,
  saveCostItem,
  savePayItem,
  seedActualsFromEstimate,
  emailActuals,
  setActualsClosed,
  setCardChargeAccount,
  setExpenseItemAccount,
  unfileCardCharge,
} from '@/app/admin/courses/actuals-actions'
import TrashIcon from '@/components/TrashIcon'
import InfoHint from '@/components/InfoHint'
import SuggestedNumber from '@/components/SuggestedNumber'

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

// How the offered quote describes itself. A draft is worth offering — it is
// still the only number anybody has written down for this course — but it has
// to say that it is one, or the box beside it reads as agreed.
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
  seed,
  invoicedSuggestion,
  readers,
}: {
  instanceId: string
  /** Everything as the shared loader assembled it — the same shape the
      emailed page and the PDF read, so the three cannot drift. */
  actuals: LoadedActuals
  /** The staffed crew, for attributing a pay line to a person. */
  people: { id: string; name: string }[]
  suggestion: { lines: { description: string; amount: number }[]; total: number; assumptions: string } | null
  /** The estimate, ready to be written in as the starting point — present
      only on a course that has a COA and has never been seeded or typed in.
      Written on open rather than offered behind a button: what the COA lists
      is what the course is about to spend money on, so the reconciliation
      begins as a list to correct rather than a blank one to remember. */
  seed: {
    /** Which COA it came from, so the note can say so. */
    from: string
    pay: { description: string; amount: number }[]
    costs: { account_id: string | null; description: string; amount: number }[]
  } | null
  /** What the page already knows we billed, offered as a starting point and
      never as the value.

      It comes from the billing handoff now, not from the quote. The chain is
      estimate → quote → billing → invoiced, and each link suggests the last
      one's number and lets you override it: a quote is what we offered, the
      handoff is what we actually asked Harken to invoice, and this is what we
      billed. Reading back past the handoff to the quote skipped the one step
      where the number most often changes. The quote still stands in on a
      course that has never been handed over, because a number the page holds
      beats retyping one. `text` says which it is, in words, so the line is
      never a figure of unknown parentage. */
  invoicedSuggestion: ChainLink | null
  /** The people on the course-numbers list in Portal → Billing. Empty means
      nobody is on it, and the block says so rather than offering a send with
      no addresses behind it. */
  readers: { id: string; name: string }[]
}) {
  const router = useRouter()
  const { expenseLines } = loaded
  // Local, because a category invented while typing has to appear in every
  // dropdown immediately. Asking the server for it again would re-run every
  // query on the course page to learn one row we already have.
  const [accounts, setAccounts] = useState<CostAccount[]>(loaded.accounts)

  const [invoiced, setInvoiced] = useState(loaded.invoiced === null ? '' : String(loaded.invoiced))
  // Blank means "follow the org number", which is what nearly every course
  // does — so the box shows the org's figure as a placeholder rather than
  // stamping a copy of it onto this course.
  const [loadPct, setLoadPct] = useState(
    loaded.payrollLoadOverride === null ? '' : String(round1(loaded.payrollLoadOverride * 100))
  )
  const [notes, setNotes] = useState(loaded.notes ?? '')
  const [closed, setClosed] = useState(Boolean(loaded.closedAt))
  const [closedAt, setClosedAt] = useState<string | null>(loaded.closedAt)
  const [shareToken, setShareToken] = useState(loaded.shareToken)
  const [shareSentAt, setShareSentAt] = useState(loaded.shareSentAt)
  // Who this send goes to, and what is said with it. Everybody ticked, the
  // same as the billing handoff — and a note, because a P&L landing on its
  // own invites the question it does not answer.
  const [sendTo, setSendTo] = useState<string[]>(() => readers.map((r) => r.id))
  const [sent, setSent] = useState<string[] | null>(null)

  // Exactly the lines that exist, and a button to add one.
  //
  // These lists used to end in a standing blank row, so that typing a cost
  // cost no click at all. That was right when they started empty; they fill
  // themselves now — seeded from the COA, fed by the card and by expense
  // reports — and an empty row under populated ones read as a line somebody
  // had failed to delete, made worse by having no bin of its own. A row you
  // asked for is a row you can also remove, and the list above the button is
  // all data.
  //
  // A row added and left untouched still never reaches the server: the save
  // fires on change, so an empty one costs nothing but the space it takes.
  const [pay, setPay] = useState<PayRow[]>(loaded.payLines.map((l) => ({ ...l, key: l.id })))
  const [costs, setCosts] = useState<CostRow[]>(loaded.costLines.map((l) => ({ ...l, key: l.id })))
  // Card charges are the statement's, not this screen's: the only things that
  // can change about one here are which category it sits in and whether it
  // belongs to this course at all. Held in state so both answers show
  // immediately, the same as everything else in the panel.
  const [cards, setCards] = useState<TypedCostLine[]>(loaded.cardLines)
  const [overrides, setOverrides] = useState<Map<string, string>>(new Map(loaded.expenseAccounts))
  const [openAccount, setOpenAccount] = useState<string | null>(null)
  const [pendingOpen, setPendingOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>())
  const chains = useRef(new Map<string, Promise<unknown>>())
  // Server ids for rows added in this session, so the second save of a new
  // row updates the first save's row instead of inserting a second one. The
  // id cannot be read off state here: a save fired while the previous one is
  // still in flight would see the id state had before it landed.
  const ids = useRef(new Map<string, string>())

  // ── The estimate, written in as the starting point ────────────────────────
  //
  // On open rather than behind a button: the COA is a list of what this
  // course is about to spend money on, and beginning the reconciliation from
  // an empty screen meant retyping it from memory. The lines arrive as
  // ordinary rows — correct them, delete the ones that never happened.
  //
  // Once, ever. The ref stops React's second run in development and a fold
  // reopened in this session; the check that actually counts is the server's,
  // which claims the seed with one conditional update, so a second tab open
  // on the same course comes back empty-handed rather than doubling the list.
  const seeding = useRef(false)
  const [seededFrom, setSeededFrom] = useState<string | null>(null)
  useEffect(() => {
    if (!seed || seeding.current) return
    if (!pay.every(payIsBlank) || !costs.every(costIsBlank)) return
    seeding.current = true
    void (async () => {
      try {
        const made = await seedActualsFromEstimate(instanceId, { pay: seed.pay, costs: seed.costs })
        // Nothing to say when nothing was written — a course whose whole
        // estimate is travel has no seedable cost at all, and a note about
        // lines that are not there would send somebody looking for them.
        if (!made || (made.pay.length === 0 && made.costs.length === 0)) return
        setPay((rows) => [
          ...rows.filter((r) => !payIsBlank(r)),
          ...made.pay.map((l) => ({ key: l.id, id: l.id, profile_id: null, work_date: null, description: l.description, amount: l.amount })),
        ])
        setCosts((rows) => [
          ...rows.filter((r) => !costIsBlank(r)),
          ...made.costs.map((l) => ({ key: l.id, id: l.id, account_id: l.account_id, spend_date: null, description: l.description, amount: l.amount })),
        ])
        setSeededFrom(seed.from)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not start this from the estimate')
      }
    })()
    // Mount only: the seed is a starting point, not something that follows
    // the estimate as it changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
    // One list to the books: a charge on the card and a line somebody typed
    // are the same money in the same category.
    typedLines: [...costs, ...cards],
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

  function addPay() {
    setPay((rs) => [...rs, { key: newKey(), id: '', profile_id: null, work_date: null, description: null, amount: 0 }])
  }

  function addCost() {
    setCosts((rs) => [...rs, { key: newKey(), id: '', account_id: null, spend_date: null, description: null, amount: 0 }])
  }

  function updatePay(key: string, patch: Partial<PayRow>) {
    setPay((rows) => {
      const next = rows.map((r) => (r.key === key ? { ...r, ...patch } : r))
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
      const next = rows.map((r) => (r.key === key ? { ...r, ...patch } : r))
      const row = next.find((r) => r.key === key)!
      schedule(`cost:${key}`, async () => {
        const known = row.id || ids.current.get(key) || null
        const saved = await saveCostItem(instanceId, known, {
          account_id: row.account_id,
          spend_date: row.spend_date,
          description: row.description,
          amount: String(row.amount),
          payment_method: row.payment_method ?? null,
          payment_ref: row.payment_ref ?? null,
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
    setPay((rs) => rs.filter((r) => r.key !== row.key))
    await settle(`pay:${row.key}`)
    const id = row.id || ids.current.get(row.key)
    if (id) await deletePayItem(instanceId, id).catch(() => router.refresh())
  }

  async function removeCost(row: CostRow) {
    setCosts((rs) => rs.filter((r) => r.key !== row.key))
    await settle(`cost:${row.key}`)
    const id = row.id || ids.current.get(row.key)
    if (id) await deleteCostItem(instanceId, id).catch(() => router.refresh())
  }

  async function fileCard(chargeId: string, accountId: string | null) {
    setCards((cs) => cs.map((c) => (c.id === chargeId ? { ...c, account_id: accountId } : c)))
    await setCardChargeAccount(instanceId, chargeId, accountId).catch((e: unknown) =>
      setError(e instanceof Error ? e.message : 'Could not move that charge')
    )
  }

  async function dropCard(chargeId: string) {
    const previous = cards
    setCards((cs) => cs.filter((c) => c.id !== chargeId))
    await unfileCardCharge(instanceId, chargeId).catch((e: unknown) => {
      setCards(previous)
      setError(e instanceof Error ? e.message : 'Could not take that charge off this course')
    })
  }

  /** A category invented while typing the cost that needed it, which is the
      only moment anybody wants one. Returns its id so the row that asked can
      assign itself to it. */
  async function createCategory(): Promise<string | null> {
    const name = window.prompt('New cost category')?.trim()
    if (!name) return null
    setBusy(true)
    try {
      const created = await addCostAccount(instanceId, name)
      setAccounts((a) => [...a, created].sort((x, y) => x.sort_order - y.sort_order))
      return created.id
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

  // Grouped by report rather than listed flat: two lines in draft are almost
  // always one person's unfiled report, and "ask Jake" is the whole of what
  // a reader can do about it.
  const pendingByReport = groupByReport(actuals.pending.lines)

  const cardTotal = round2(cards.reduce((t, c) => t + c.amount, 0))

  // The part of the uncategorised pile that came from the list above rather
  // than from an expense report whose category was retired.
  const unfiledTyped = round2(
    actuals.unfiled.amount - actuals.unfiled.lines.reduce((t, l) => t + l.amount, 0)
  )

  // What separates one segment of the panel from the next, and what names
  // one. The names were the same weight as "Actuals" itself, so a reader
  // scanning saw six titles of equal standing and no telling which was the
  // section and which its parts. They are quieter than the fold's own title
  // now, and identical to each other — a heading's job here is to say where
  // you are, not to compete.
  const sectionRule = 'pt-6 border-t border-zinc-800'
  const sectionTitle = 'text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500'

  // Where a number comes from, when it does not come from this screen.
  const libraryLink = 'text-xs text-zinc-500 hover:text-zinc-300 underline underline-offset-2 decoration-zinc-700 transition-colors'

  const input = 'bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-sm text-white focus:outline-none focus:border-zinc-500'
  const addLine = 'text-xs text-zinc-500 hover:text-zinc-200 transition-colors'
  const cell = 'text-sm text-zinc-300'

  return (
    <div className="space-y-6">
      {error && (
        <p className="text-xs text-pr-red-light">{error} — the last change may not have been kept.</p>
      )}

      {/* Said once, on the screen it just filled in. Every number below came
          from the estimate at cost, which is a guess about a course that has
          already happened — so the note names where it came from and invites
          the correction rather than sitting there looking authoritative. */}
      {seededFrom && (
        <p className="text-xs text-zinc-500">
          Started from <span className="text-zinc-300">{seededFrom}</span> &mdash; the estimate&rsquo;s lines at cost and
          pay at what we pay, leaving out anything an expense report will bring in on its own. All guesses: correct
          them, or delete what never happened.
        </p>
      )}

      {/* ── What we billed ───────────────────────────────────────────────── */}
      <div>
        <div className="flex items-baseline gap-2 mb-2">
          <h4 className={sectionTitle}>Invoiced</h4>
          <InfoHint text="What we actually billed. It starts from what was handed to Harken — which itself started from the quote, which started from the estimate — and every one of those steps can be overridden, this one included." />
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
          <SuggestedNumber
            link={invoicedSuggestion}
            current={actuals.invoiced}
            onUse={(total) => {
              setInvoiced(String(total))
              saveHeader({ invoiced: String(total) })
            }}
          />
        </div>
      </div>

      {/* ── Pay ──────────────────────────────────────────────────────────── */}
      {/* Full-width rules divide the sections — invoiced, pay, costs,
          totals, notes, and what you can do with it all. Inside a section a
          rule means "the sum of the rows above", and those are short ones
          over the amount column only. A full rule doing both jobs read as a
          division in the wrong place. */}
      <div className={sectionRule}>
        <div className="flex items-baseline gap-2 mb-2">
          <h4 className={sectionTitle}>Pay</h4>
          <InfoHint text="Hours live in ADP, not here, so pay is typed. Any suggestion comes from the course's length and the library's pay rates." />
          <Link href="/admin/expenses/rates#pay-rates" className={libraryLink}>
            Pay rates
          </Link>
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
                  const created = await addSuggestedPayLines(instanceId, suggestion.lines)
                  setPay((rows) => [
                    ...rows.filter((r) => !payIsBlank(r)),
                    ...created.map((c) => ({
                      key: c.id,
                      id: c.id,
                      profile_id: null,
                      work_date: null,
                      description: c.description,
                      amount: c.amount,
                    })),
                  ])
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
              {/* Every row, blank ones included: a row you asked for is a
                  row you can take back. */}
              <button onClick={() => void removePay(row)} className="text-zinc-600 hover:text-pr-red-light transition-colors" title="Remove">
                <TrashIcon className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>

        {/* The way a line gets here. Asked for rather than always waiting:
            these lists arrive with pay in them now, and a standing empty row
            under those read as something stuck. */}
        <button onClick={addPay} className={`${addLine} mt-2`}>
          + Add a pay line
        </button>

        <div className="mt-3 space-y-1 text-sm">
          {/* Sums the rows above it, so the rule sits over the numbers rather
              than across the panel. */}
          <div className="flex justify-end pb-1">
            <div className="w-40 border-t border-zinc-800" />
          </div>
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
                <Link href="/admin/expenses/rates#org-wide" className="text-xs text-zinc-500 hover:text-zinc-300 underline underline-offset-2 decoration-zinc-700 transition-colors">
                  org-wide
                </Link>
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
      <div className={sectionRule}>
        <div className="flex items-baseline gap-2 mb-2">
          <h4 className={sectionTitle}>Costs</h4>
          <InfoHint text="Type what no feed will bring in on its own — a check, an ACH, an invoice paid from the bank. Card charges and submitted expense reports arrive by themselves. Categories are shared by every course." />
          <Link href="/admin/expenses/rates#cost-categories" className={libraryLink}>
            Categories
          </Link>
        </div>

        <div className="space-y-1.5">
          {costs.map((row) => (
            <CostRowFields
              key={row.key}
              row={row}
              accounts={accounts}
              input={input}
              onNewCategory={createCategory}
              onChange={(p) => updateCost(row.key, p)}
              onRemove={() => void removeCost(row)}
            />
          ))}
        </div>

        <button onClick={addCost} className={`${addLine} mt-2`}>
          + Add a cost
        </button>

        {/* ── From the card ────────────────────────────────────────────────
            The statement's rows, tagged to this course on the card screen and
            read live from there. Deliberately not editable here beyond the
            two things a course can say about a charge: which category it
            belongs in, and that it does not belong to this course. The date,
            the merchant and the amount are the bank's facts, and a screen
            that let somebody retype them would be inviting the books to
            disagree with the statement they are reconciled against. */}
        {cards.length > 0 && (
          <div className="mt-5">
            <div className="flex items-baseline gap-2 mb-2">
              <h5 className="text-xs text-zinc-500">From the card</h5>
              <InfoHint text="Statement rows tagged to this course. Read live from the card screen, so re-tagging one there moves the money here." />
              <Link href="/admin/expenses/card" className={libraryLink}>
                Statement
              </Link>
            </div>
            <div className="space-y-1.5">
              {cards.map((c) => (
                <div key={c.id} className="flex items-center gap-2 flex-wrap text-sm">
                  <span className="text-xs text-zinc-500 w-20 shrink-0">
                    {c.spend_date ? fmtDateRange(c.spend_date, null) : ''}
                  </span>
                  <span className="text-zinc-300 flex-1 min-w-40 truncate" title={c.description ?? ''}>
                    {c.description}
                    {c.cardholder && <span className="ml-2 text-xs text-zinc-600">{c.cardholder}</span>}
                  </span>
                  <span className="text-zinc-300 w-24 text-right tabular-nums">{fmtMoney(c.amount)}</span>
                  <select
                    value={c.account_id ?? ''}
                    onChange={(e) => void fileCard(c.id, e.target.value || null)}
                    className="bg-zinc-800 border border-zinc-700 rounded px-1.5 py-0.5 text-xs text-zinc-300"
                    title="Which category this charge belongs in"
                  >
                    <option value="">— category —</option>
                    {accounts.map((a) => (
                      <option key={a.id} value={a.id}>{a.label}</option>
                    ))}
                  </select>
                  <button
                    onClick={() => void dropCard(c.id)}
                    title="Not this course — put it back in the pile to be filed"
                    className="text-zinc-600 hover:text-pr-red-light transition-colors text-xs"
                  >
                    &times;
                  </button>
                </div>
              ))}
            </div>
            <p className="text-xs text-zinc-600 mt-2">
              {fmtMoney(cardTotal)} on {cards.length} {cards.length === 1 ? 'charge' : 'charges'}.
            </p>
          </div>
        )}

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

                    {/* Both of these are already on screen above, so the
                        category only has to say how much of its total came
                        from each — and which list to go and look at. */}
                    {r.typedLines.length > 0 && (
                      <p className="text-xs text-zinc-500">
                        {[
                          countOf(r.typedLines, 'typed'),
                          countOf(r.typedLines, 'card'),
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                        , above.
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

        {/* Money we are going to pay and have not. Naming a figure without
            saying whose it is leaves the reader with a number and nowhere to
            go — and the only way to move it is to ask that person to file,
            since a draft belongs to whoever is writing it. */}
        {actuals.pending.amount > 0 && (
          <div className="mt-3">
            <button
              onClick={() => setPendingOpen((o) => !o)}
              className="text-xs text-amber-400/90 hover:text-amber-300 transition-colors text-left"
            >
              {fmtMoney(actuals.pending.amount)} across {actuals.pending.lines.length} expense line
              {actuals.pending.lines.length === 1 ? '' : 's'} is still in draft, and not counted.
              <span className="ml-1 text-amber-400/60">{pendingOpen ? '▴' : '▾'}</span>
            </button>

            {pendingOpen && (
              <div className="mt-2 pl-3 space-y-3">
                {pendingByReport.map((g) => (
                  <div key={g.reportId}>
                    <p className="text-xs text-zinc-500">
                      {g.personName ?? 'Unknown'} · {fmtMoney(g.total)} · not submitted yet
                    </p>
                    <div className="mt-1 space-y-0.5">
                      {g.lines.map((l) => (
                        <div key={l.id} className="flex items-center gap-2 flex-wrap text-xs">
                          <span className="text-zinc-500 w-24 shrink-0">{fmtDateRange(l.start_date, null)}</span>
                          <span className="text-zinc-400 flex-1 min-w-32 truncate">
                            {expenseLineLabel(l)}
                            {l.paid_by === 'company_card' ? <span className="text-zinc-600"> · card</span> : null}
                          </span>
                          <span className="text-zinc-400 w-20 text-right">{fmtMoney(l.amount)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Totals ───────────────────────────────────────────────────────── */}
      {/* Three lines that are all sums of the sections above, which is why
          they needed a name: unlabelled, "Invoiced" here read as a second box
          to fill in rather than as the number from the top of the panel
          arriving at the bottom of it. */}
      <div className={`${sectionRule} space-y-1`}>
        <h4 className={`${sectionTitle} mb-2`}>Totals</h4>
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

      {/* ── Notes ────────────────────────────────────────────────────────── */}
      {/* One box, not two. There was a second free-text field in the send
          block for "anything to say with it", which is the same sentence
          typed about the same numbers — and the notes already travel: they
          are printed on the PDF and shown on the page a reader opens. Two
          boxes only asked which one the reader would see. */}
      <div className={sectionRule}>
        <div className="flex items-baseline gap-2 mb-2">
          <h4 className={sectionTitle}>Notes</h4>
          <InfoHint text="Kept with the course, printed on the PDF, shown on the page anyone is sent, and included in the email that sends it. This is where a number that needs explaining gets explained." />
        </div>
        <textarea
          value={notes}
          onChange={(e) => {
            setNotes(e.target.value)
            saveHeader({ notes: e.target.value })
          }}
          rows={3}
          placeholder="Why the margin came in where it did, what is still to land, anything a reader would ask about"
          className={`${input} w-full`}
        />
      </div>

      {/* ── What you can do with all this ────────────────────────────────── */}
      {/* Every action in one place and in one style, because they were
          scattered: a PDF link in one block, a send in another, and closing
          the books as a tick box in a footnote under a text area. Taking the
          numbers away, sending them, and saying they are final are three
          things a person does when they are finished — so they are together,
          at the end, where finishing happens. */}
      <div className={`${sectionRule} space-y-3`}>
        <div className="flex items-center gap-2 flex-wrap">
          <a
            href={`/api/actuals/${instanceId}/pdf`}
            target="_blank"
            rel="noreferrer"
            className="px-3 py-2 text-sm rounded bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-200 transition-colors"
          >
            Download PDF
          </a>
          {/* The same button as "Send to Harken" one fold up, because it is
              the same kind of act — handing this course's numbers to somebody
              outside — and two send buttons styled differently on one page
              read as two different weights of decision. */}
          <button
            disabled={busy || readers.length === 0 || sendTo.length === 0}
            onClick={async () => {
              setBusy(true)
              setError(null)
              try {
                const res = await emailActuals(instanceId, { note: notes, recipientIds: sendTo })
                if (res.ok) {
                  setShareToken(res.token)
                  setShareSentAt(res.sentAt)
                  setSent(res.sentTo)
                } else setError(res.error)
              } catch (e) {
                setError(e instanceof Error ? e.message : 'Could not send that email')
              } finally {
                setBusy(false)
              }
            }}
            className="px-3 py-2 text-sm rounded bg-pr-red/90 hover:bg-pr-red text-white transition-colors disabled:opacity-50 whitespace-nowrap"
          >
            {busy ? 'Sending…' : shareSentAt ? 'Send the numbers again' : 'Send the numbers'}
          </button>

          {readers.length === 0 ? (
            <span className="text-xs text-zinc-600">
              Nobody on the P&amp;L reporting list —{' '}
              <Link href="/admin/billing" className={libraryLink}>
                add somebody
              </Link>
            </span>
          ) : readers.length === 1 ? (
            <span className="text-xs text-zinc-600">
              to {readers[0].name}
              {' · '}
              <Link href="/admin/billing" className={libraryLink}>
                change
              </Link>
            </span>
          ) : (
            <span className="flex items-center gap-3 flex-wrap text-xs text-zinc-600">
              to
              {readers.map((r) => (
                <label key={r.id} className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={sendTo.includes(r.id)}
                    onChange={(e) =>
                      setSendTo((ids) => (e.target.checked ? [...ids, r.id] : ids.filter((i) => i !== r.id)))
                    }
                    className="accent-pr-red"
                  />
                  {r.name}
                </label>
              ))}
              <Link href="/admin/billing" className={libraryLink}>
                change
              </Link>
            </span>
          )}

          {/* Saying the books are done is a decision, not a preference, and it
              was a tick box in the smallest text on the panel. It sits with
              the other things you do when you are finished, and says when it
              happened once it has. */}
          <span className="ml-auto flex items-center gap-2">
            {closed && closedAt && <span className="text-xs text-emerald-400/80">Closed {sentDate(closedAt)}</span>}
            <button
              disabled={busy}
              onClick={async () => {
                const next = !closed
                setClosed(next)
                setClosedAt(next ? new Date().toISOString() : null)
                await setActualsClosed(instanceId, next).catch(() => router.refresh())
              }}
              className={`px-3 py-2 text-sm rounded border transition-colors disabled:opacity-50 ${
                closed
                  ? 'border-zinc-700 text-zinc-400 hover:text-white hover:border-zinc-500'
                  : 'border-zinc-700 bg-zinc-800 text-zinc-200 hover:bg-zinc-700'
              }`}
            >
              {closed ? 'Reopen the books' : 'Close the books'}
            </button>
            <InfoHint text="Closing locks nothing — a number that turns out wrong is still fixable. It tells the year's totals which courses have stopped moving." />
          </span>
        </div>

        {shareSentAt && (
          <p className="text-xs text-zinc-500">
            Last sent {sentDate(shareSentAt)}
            {sent && sent.length > 0 ? ` to ${sent.join(' and ')}` : ''}. The notes above go with it, and the page
            stays current — anything corrected here shows up there.
          </p>
        )}

        {/* The address that went out, and the way to cut it. */}
        {shareToken && (
          <div className="flex items-center gap-3 flex-wrap text-xs">
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
                  // The stamp goes with the link: "sent Tuesday" beside no
                  // address is a claim about an address nobody can reach.
                  setShareSentAt(null)
                  setSent(null)
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
            <InfoHint text="Anyone with this address can read these numbers — pay and margin included — without signing in. Revoking is immediate and cuts every copy at once." />
          </div>
        )}
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
  onNewCategory,
  onChange,
  onRemove,
}: {
  row: CostRow & { key: string }
  accounts: CostAccount[]
  input: string
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
      {/* How it went out. Blank for most lines and that is fine — it earns its
          place on the ones no feed will ever announce: a check to a venue, an
          ACH to a permit office. Those are the costs that go missing, and the
          number beside them is what the books are asked for later. */}
      <select
        value={row.payment_method ?? ''}
        onChange={(e) => onChange({ payment_method: (e.target.value || null) as CostRow['payment_method'] })}
        title="How it was paid"
        className={`${input} w-24`}
      >
        <option value="">— paid by —</option>
        <option value="check">Check</option>
        <option value="ach">ACH</option>
        <option value="card">Card</option>
        <option value="other">Other</option>
      </select>
      {(row.payment_method === 'check' || row.payment_method === 'ach') && (
        <input
          value={row.payment_ref ?? ''}
          onChange={(e) => onChange({ payment_ref: e.target.value })}
          placeholder={row.payment_method === 'check' ? 'Check no.' : 'Reference'}
          className={`${input} w-24 placeholder-zinc-600`}
        />
      )}
      {/* Every row, blank ones included: a row you asked for is a row you
          can take back. */}
      <button onClick={onRemove} className="text-zinc-600 hover:text-pr-red-light transition-colors" title="Remove">
        <TrashIcon className="w-4 h-4" />
      </button>
    </div>
  )
}

/** "$240 typed" / "$312 on the card", or nothing at all when a category has
    none of that kind. Money first, because the reader is chasing a number. */
function countOf(lines: TypedCostLine[], source: 'typed' | 'card'): string {
  const mine = lines.filter((l) => (l.source ?? 'typed') === source)
  if (mine.length === 0) return ''
  const total = fmtMoney(round2(mine.reduce((t, l) => t + l.amount, 0)))
  return source === 'card'
    ? `${total} on ${mine.length} card ${mine.length === 1 ? 'charge' : 'charges'}`
    : `${total} typed on ${mine.length} ${mine.length === 1 ? 'line' : 'lines'}`
}

// A timestamp read as a day: when these numbers were last sent is a date,
// and the hour it went out has never been the question.
function sentDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
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
  // How it was paid counts as having typed something: choosing "Check" on the
  // trailing row saves it, so a row that still called itself blank would have
  // no way to be deleted and no new blank row under it.
  return (
    !r.id && !r.description?.trim() && !r.amount && !r.amountText?.trim() && !r.account_id && !r.spend_date &&
    !r.payment_method
  )
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



// A row's identity before the server has given it one. Only has to be unique
// within this panel for as long as it is open.
let keySeq = 0
function newKey(): string {
  keySeq += 1
  return `new-${keySeq}`
}
