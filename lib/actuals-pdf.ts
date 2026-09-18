// The course's profit and loss as a page — what gets attached to an email or
// dropped in a folder, and what the spreadsheet used to be printed for.
//
// A rendering of the numbers as they stand right now, not a record of them:
// an expense report corrected next week changes this, which is the whole
// point of reading the expense money live. Print it again.

import { type RGB } from 'pdf-lib'
import { CONTENT_W, FAINT, HAIRLINE, INK, MARGIN, MUTED, PdfBuilder, RED } from '@/lib/pdf-layout'
import { fmtMoney, fmtDateRange } from '@/lib/expenses'
import { dateAtOffice, longDate } from '@/lib/course-clock'
import { accountsWithMoney, carriesMoney, expenseLineLabel, payLineName } from '@/lib/actuals'
import { type LoadedActuals } from '@/lib/actuals-data'

export type ActualsPdf = {
  courseTitle: string
  courseSubtitle: string | null
  actuals: LoadedActuals
  /** Where the conversation landed, printed beside what we actually billed
      when the two differ — the difference is usually the story of the course. */
  acceptedQuote: { seq: number; total: number } | null
  /** yyyy-mm-dd, on the office clock. A bare date rather than an instant,
      because "as of" is a question about where you are standing: formatting
      `new Date()` as UTC printed tomorrow's date from six in the evening
      onwards in Colorado. */
  generatedOn: string
}

export async function generateActualsPdf(data: ActualsPdf): Promise<Uint8Array> {
  const { actuals } = data
  const { rolled } = actuals

  const b = await PdfBuilder.create({
    title: data.courseTitle,
    subtitle: data.courseSubtitle,
    kind: 'Course actuals',
  })

  // A page of money with no date on it is a page somebody will read next year
  // as though it were still true.
  const asOf = longDate(data.generatedOn)
  b.paragraph(
    actuals.closedAt
      ? `Closed ${longDate(dateAtOffice(actuals.closedAt))}. Printed ${asOf}.`
      : `As of ${asOf}. These figures move as expense reports are filed and corrected.`,
    { size: 9, color: MUTED }
  )
  b.y -= 12

  // A line of the ledger: label left, amount right-aligned in its column.
  const line = (
    label: string,
    amount: number | null,
    opts?: { bold?: boolean; color?: RGB; indent?: number; note?: string; size?: number }
  ) => {
    const size = opts?.size ?? 10
    b.ensure(size * 1.6)
    const x = MARGIN + (opts?.indent ?? 0)
    b.text(label, { x, size, bold: opts?.bold, color: opts?.color ?? INK })
    if (opts?.note) {
      const labelW = (opts?.bold ? b.bold : b.font).widthOfTextAtSize(label, size)
      b.text(opts.note, { x: x + labelW + 6, size: size - 1.5, color: FAINT })
    }
    if (amount !== null) {
      const text = fmtMoney(amount)
      const font = opts?.bold ? b.bold : b.font
      b.text(text, {
        x: MARGIN + CONTENT_W - font.widthOfTextAtSize(text, size),
        size,
        bold: opts?.bold,
        color: opts?.color ?? INK,
      })
    }
    b.y -= size * 1.6
  }

  // ── Invoiced ───────────────────────────────────────────────────────────────

  b.sectionHeading('Invoiced')
  line('Billed to the client', rolled.invoiced, { bold: true })
  if (data.acceptedQuote && Math.abs(data.acceptedQuote.total - rolled.invoiced) > 0.005) {
    line(`Quote ${data.acceptedQuote.seq}, as accepted`, data.acceptedQuote.total, {
      size: 9,
      color: MUTED,
      indent: 10,
    })
  }
  b.y -= 10

  // ── Pay ────────────────────────────────────────────────────────────────────

  b.sectionHeading('Pay')
  const payLines = actuals.payLines.filter(carriesMoney)
  if (payLines.length === 0) {
    b.paragraph('No pay recorded.', { size: 9.5, color: MUTED })
  }
  for (const l of payLines) {
    const who = payLineName(l, actuals.peopleById)
    const label = [who, l.description].filter(Boolean).join(' — ') || 'Pay'
    line(label, l.amount, { size: 9.5, indent: 10 })
  }
  b.y -= 2
  b.hairline({ x: MARGIN + CONTENT_W - 220, width: 220 })
  b.y -= 12
  line('Pay total', rolled.payTotal, { size: 9.5 })
  line(`Payroll load at ${round1(actuals.payrollLoadPct * 100)}%`, rolled.payrollLoad, { size: 9.5 })
  line('Instructor pay', rolled.instructorPay, { bold: true })
  b.y -= 10

  // ── Costs ──────────────────────────────────────────────────────────────────

  b.sectionHeading('Costs')
  // Only the accounts with money in them. The chart used to print in full,
  // zeros and all, on the theory that a reader checking whether marketing was
  // charged needs to see the zero — but a printed page of "$0.00" rows is a
  // table of contents for an empty book, and the reader's real question is
  // what this course cost.
  for (const r of accountsWithMoney(rolled.accounts)) {
    line(r.account.label, r.total, {
      size: 9.5,
      indent: 10,
      color: r.total > 0 ? INK : MUTED,
      note:
        r.fromExpenses > 0
          ? `${fmtMoney(r.fromExpenses)} from ${r.expenseLines.length} expense line${r.expenseLines.length === 1 ? '' : 's'}`
          : undefined,
    })
  }
  if (rolled.unfiled.amount > 0) {
    line('Not filed to an account', rolled.unfiled.amount, { size: 9.5, indent: 10, color: RED })
  }
  line('Instructor pay', rolled.instructorPay, { size: 9.5, indent: 10 })
  b.y -= 2
  b.hairline({ x: MARGIN + CONTENT_W - 220, width: 220 })
  b.y -= 12
  line('Costs total', rolled.costsTotal, { bold: true })
  b.y -= 14

  // ── What it left ───────────────────────────────────────────────────────────

  b.ensure(46)
  b.hairline({ color: HAIRLINE })
  b.y -= 18
  line('Net', rolled.net, {
    bold: true,
    size: 13,
    color: rolled.net < 0 ? RED : INK,
    note: rolled.netPct === null ? undefined : `${(rolled.netPct * 100).toFixed(2)}% of invoiced`,
  })
  b.y -= 8

  if (rolled.pending.amount > 0) {
    b.paragraph(
      `${fmtMoney(rolled.pending.amount)} across ${rolled.pending.lines.length} expense line${rolled.pending.lines.length === 1 ? '' : 's'} is still in draft, and not counted.`,
      { size: 9, color: RED }
    )
    b.y -= 8
  }

  if (actuals.notes?.trim()) {
    b.sectionHeading('Notes')
    b.paragraph(actuals.notes.trim(), { size: 9.5, color: MUTED, paragraphs: true })
  }

  // ── The expense lines themselves ───────────────────────────────────────────
  // Last, because the totals above are what the page is for. But somebody
  // always asks what the $600 of travel was, and the answer being a different
  // document is how these get queried by email instead of read.

  const submitted = actuals.expenseLines.filter((l) => l.submitted && carriesMoney(l))
  if (submitted.length > 0) {
    b.y -= 12
    b.sectionHeading('Expense-report lines behind those totals')
    for (const r of rolled.accounts.filter((a) => a.expenseLines.some(carriesMoney))) {
      b.ensure(30)
      b.text(r.account.label.toUpperCase(), { size: 7.5, color: FAINT })
      b.y -= 13
      for (const l of r.expenseLines.filter(carriesMoney)) {
        const when = fmtDateRange(l.start_date, null)
        const what = expenseLineLabel(l)
        const who = [l.personName, l.paid_by === 'company_card' ? 'company card' : null].filter(Boolean).join(', ')
        line(`${when}   ${what}`, l.amount, { size: 9, indent: 10, color: MUTED, note: who || undefined })
      }
      b.y -= 6
    }
  }

  return b.save()
}

function round1(n: number): number {
  return Math.round(n * 10) / 10
}

