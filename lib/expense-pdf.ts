// Generates the expense-report PDF in the layout Harken accounting receives
// today (their "Harken Expense Report" grid), typed instead of hand-filled.
// Page 1(+overflow): the expense grid with per-column totals, summary, and
// signature blocks. Final page: itemized details for "Other" charges and meals
// paid for others (the form's "page 2" rule).

import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from 'pdf-lib'
import {
  type ExpenseCategory,
  computeTotals,
  balanceDueEmployee,
  fmtDateRange,
  round2,
} from '@/lib/expenses'

export type PdfItem = {
  start_date: string
  end_date: string | null
  category: ExpenseCategory
  paid_by: 'personal' | 'company_card'
  description: string | null
  details: string | null
  paid_for_others: boolean
  miles: number | null
  amount: number
  courseTitle: string | null
}

export type PdfReport = {
  employeeName: string
  reason: string | null
  submittedAt: Date
  items: PdfItem[]
  signaturePngDataUrl: string | null
}

const PAGE_W = 792 // letter landscape
const PAGE_H = 612
const MARGIN = 36
const GRID_TOP = PAGE_H - 108
const ROW_H = 16
const BLACK = rgb(0, 0, 0)
const GRAY = rgb(0.45, 0.45, 0.45)
const LIGHT = rgb(0.88, 0.88, 0.88)

// Grid columns: key, header lines, width, money/category mapping.
type Col = { key: string; header: string[]; w: number }
const COLS: Col[] = [
  { key: 'date', header: ['Date'], w: 62 },
  { key: 'desc', header: ['Description'], w: 128 },
  { key: 'paid', header: ['Paid'], w: 34 },
  { key: 'air_fare', header: ['Air Fare'], w: 48 },
  { key: 'auto_rental', header: ['Auto', 'Rental'], w: 48 },
  { key: 'transport', header: ['Parking,', 'Tolls, Gas'], w: 48 },
  { key: 'miles', header: ['Miles'], w: 34 },
  { key: 'auto_amount', header: ['Auto', 'Amount'], w: 48 },
  { key: 'lodging', header: ['Lodging'], w: 48 },
  { key: 'breakfast', header: ['Brkfst'], w: 42 },
  { key: 'lunch', header: ['Lunch'], w: 42 },
  { key: 'dinner', header: ['Dinner'], w: 42 },
  { key: 'other', header: ['Other'], w: 46 },
  { key: 'total', header: ['Total'], w: 50 },
]

// Which money column an item's amount lands in.
function moneyColumn(category: ExpenseCategory): string {
  switch (category) {
    case 'personal_auto': return 'auto_amount'
    case 'per_diem': return 'other'
    case 'air_fare':
    case 'auto_rental':
    case 'transport':
    case 'lodging':
    case 'breakfast':
    case 'lunch':
    case 'dinner':
      return category
    default: return 'other'
  }
}

function money(n: number): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function colX(key: string): number {
  let x = MARGIN
  for (const c of COLS) {
    if (c.key === key) return x
    x += c.w
  }
  return x
}

const GRID_W = COLS.reduce((s, c) => s + c.w, 0)

function truncate(font: PDFFont, text: string, size: number, maxW: number): string {
  if (font.widthOfTextAtSize(text, size) <= maxW) return text
  let t = text
  while (t.length > 1 && font.widthOfTextAtSize(t + '…', size) > maxW) t = t.slice(0, -1)
  return t + '…'
}

export async function generateExpensePdf(report: PdfReport): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)

  const totals = computeTotals(report.items)
  const cardItems = report.items.filter((i) => i.paid_by === 'company_card')
  const columnSum = (items: PdfItem[], colKey: string) =>
    round2(items.filter((i) => moneyColumn(i.category) === colKey).reduce((s, i) => s + i.amount, 0))

  const drawCell = (page: PDFPage, y: number, key: string, text: string, opts?: { bold?: boolean; alignRight?: boolean; color?: ReturnType<typeof rgb> }) => {
    const c = COLS.find((col) => col.key === key)!
    const f = opts?.bold ? bold : font
    const size = 7
    const clipped = truncate(f, text, size, c.w - 6)
    const w = f.widthOfTextAtSize(clipped, size)
    const x = opts?.alignRight ? colX(key) + c.w - 3 - w : colX(key) + 3
    page.drawText(clipped, { x, y: y + 4.5, size, font: f, color: opts?.color ?? BLACK })
  }

  const drawRowLine = (page: PDFPage, y: number) => {
    page.drawLine({ start: { x: MARGIN, y }, end: { x: MARGIN + GRID_W, y }, thickness: 0.5, color: LIGHT })
  }

  const newGridPage = (first: boolean): { page: PDFPage; y: number } => {
    const page = doc.addPage([PAGE_W, PAGE_H])

    // Header
    page.drawText('Name:', { x: MARGIN, y: PAGE_H - 42, size: 9, font: bold })
    page.drawText(report.employeeName, { x: MARGIN + 38, y: PAGE_H - 42, size: 9, font })
    page.drawText('Currency used: USD', { x: PAGE_W / 2 - 50, y: PAGE_H - 42, size: 9, font })
    page.drawText('HARKEN EXPENSE REPORT', {
      x: PAGE_W - MARGIN - bold.widthOfTextAtSize('HARKEN EXPENSE REPORT', 15),
      y: PAGE_H - 46, size: 15, font: bold,
    })
    page.drawText('Reason for travel:', { x: MARGIN, y: PAGE_H - 58, size: 9, font: bold })
    page.drawText(report.reason ?? '', { x: MARGIN + 92, y: PAGE_H - 58, size: 9, font })
    if (!first) {
      page.drawText('(continued)', { x: PAGE_W - MARGIN - 60, y: PAGE_H - 62, size: 8, font, color: GRAY })
    }

    // Column headers
    let y = GRID_TOP
    page.drawRectangle({ x: MARGIN, y: y - 4, width: GRID_W, height: 26, color: rgb(0.94, 0.94, 0.94) })
    for (const c of COLS) {
      c.header.forEach((line, i) => {
        page.drawText(line, { x: colX(c.key) + 3, y: y + 10 - i * 8, size: 6.5, font: bold })
      })
    }
    // "Personal Auto Use" group label
    page.drawText('Personal Auto Use', { x: colX('miles') + 2, y: y + 20, size: 6, font, color: GRAY })
    y -= 8
    drawRowLine(page, y)
    return { page, y: y - ROW_H }
  }

  // ── Grid rows (paginated) ──────────────────────────────────────────────────
  const FOOTER_SPACE = 210 // room needed for totals + summary on the last page
  let { page, y } = newGridPage(true)

  for (const item of report.items) {
    if (y < MARGIN + 40) {
      ;({ page, y } = newGridPage(false))
    }
    drawCell(page, y, 'date', fmtDateRange(item.start_date, item.end_date))
    const desc = [item.description, item.courseTitle ? `[${item.courseTitle}]` : null].filter(Boolean).join(' ')
    drawCell(page, y, 'desc', desc || '—')
    drawCell(page, y, 'paid', item.paid_by === 'company_card' ? 'Card' : 'Cash', { color: GRAY })
    if (item.category === 'personal_auto') {
      drawCell(page, y, 'miles', String(item.miles ?? 0), { alignRight: true })
      drawCell(page, y, 'auto_amount', money(item.amount), { alignRight: true })
    } else {
      drawCell(page, y, moneyColumn(item.category), money(item.amount), { alignRight: true })
    }
    drawCell(page, y, 'total', money(item.amount), { alignRight: true, bold: true })
    drawRowLine(page, y - 3)
    y -= ROW_H
  }

  // ── Totals rows ────────────────────────────────────────────────────────────
  if (y < MARGIN + FOOTER_SPACE) {
    ;({ page, y } = newGridPage(false))
  }

  const moneyCols = ['air_fare', 'auto_rental', 'transport', 'auto_amount', 'lodging', 'breakfast', 'lunch', 'dinner', 'other']
  const totalRow = (label: string, items: PdfItem[], sum: number) => {
    drawCell(page, y, 'date', '')
    drawCell(page, y, 'desc', label, { bold: true })
    for (const key of moneyCols) {
      const v = columnSum(items, key)
      if (v !== 0 || label === 'Total Expenses') drawCell(page, y, key, money(v), { alignRight: true })
    }
    drawCell(page, y, 'total', money(sum), { alignRight: true, bold: true })
    drawRowLine(page, y - 3)
    y -= ROW_H
  }

  y -= 4
  page.drawLine({ start: { x: MARGIN, y: y + ROW_H - 3 }, end: { x: MARGIN + GRID_W, y: y + ROW_H - 3 }, thickness: 1, color: BLACK })
  totalRow('Company Credit Card Charges', cardItems, totals.companyCard)
  totalRow('Cash / Personal Paid', report.items.filter((i) => i.paid_by === 'personal'), totals.personal)
  totalRow('Total Expenses', report.items, totals.total)

  // ── Summary block (bottom left) ────────────────────────────────────────────
  y -= 14
  const summary: [string, string][] = [
    ['Total Expenses', money(totals.total)],
    ['Less Company Credit Card Charges', money(totals.companyCard)],
    ['Balance Due Employee', money(balanceDueEmployee(totals))],
    ['Balance Due Harken', money(0)],
  ]
  page.drawText('Summary', { x: MARGIN, y, size: 9, font: bold })
  y -= 13
  for (const [label, value] of summary) {
    page.drawText(label, { x: MARGIN, y, size: 8, font })
    page.drawText(value, { x: MARGIN + 210 - font.widthOfTextAtSize(value, 8), y, size: 8, font: bold })
    y -= 12
  }

  // ── Certification + signatures (bottom right of summary) ──────────────────
  const sigX = PAGE_W / 2 - 40
  let sy = y + 4 + summary.length * 12
  page.drawText('I certify that the above expenses are business related', { x: sigX, y: sy, size: 8, font: bold })
  page.drawText('and properly reimbursable:', { x: sigX, y: sy - 10, size: 8, font: bold })
  sy -= 44

  if (report.signaturePngDataUrl?.startsWith('data:image/png;base64,')) {
    try {
      const png = await doc.embedPng(Buffer.from(report.signaturePngDataUrl.split(',')[1], 'base64'))
      const dims = png.scaleToFit(140, 34)
      page.drawImage(png, { x: sigX, y: sy - 2, width: dims.width, height: dims.height })
    } catch {
      // Unparseable signature image — leave the line blank rather than fail the PDF.
    }
  }
  page.drawLine({ start: { x: sigX, y: sy - 4 }, end: { x: sigX + 180, y: sy - 4 }, thickness: 0.75, color: BLACK })
  page.drawText('Employee Signature', { x: sigX, y: sy - 14, size: 7, font, color: GRAY })
  const dateStr = report.submittedAt.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: 'numeric' })
  page.drawText(`Date: ${dateStr}`, { x: sigX + 200, y: sy - 4, size: 8, font })

  sy -= 44
  page.drawLine({ start: { x: sigX, y: sy - 4 }, end: { x: sigX + 180, y: sy - 4 }, thickness: 0.75, color: BLACK })
  page.drawText("Supervisor's Signature", { x: sigX, y: sy - 14, size: 7, font, color: GRAY })

  // ── Details page ("page 2" of the paper form) ──────────────────────────────
  const detailItems = report.items.filter(
    (i) => i.category === 'other' || i.category === 'per_diem' || i.paid_for_others || i.details
  )
  if (detailItems.length > 0) {
    const p2 = doc.addPage([PAGE_W, PAGE_H])
    p2.drawText('Name:', { x: MARGIN, y: PAGE_H - 42, size: 9, font: bold })
    p2.drawText(report.employeeName, { x: MARGIN + 38, y: PAGE_H - 42, size: 9, font })
    p2.drawText('Page 2 — Other / Entertainment Expense Details', {
      x: PAGE_W - MARGIN - bold.widthOfTextAtSize('Page 2 — Other / Entertainment Expense Details', 12),
      y: PAGE_H - 44, size: 12, font: bold,
    })

    let dy = PAGE_H - 90
    p2.drawText('Date', { x: MARGIN, y: dy, size: 8, font: bold })
    p2.drawText('Description / location / persons included', { x: MARGIN + 90, y: dy, size: 8, font: bold })
    p2.drawText('Total', { x: PAGE_W - MARGIN - 40, y: dy, size: 8, font: bold })
    dy -= 6
    p2.drawLine({ start: { x: MARGIN, y: dy }, end: { x: PAGE_W - MARGIN, y: dy }, thickness: 0.75, color: BLACK })
    dy -= 14

    for (const item of detailItems) {
      const lines = [
        item.description ?? '',
        item.details ?? '',
        item.paid_for_others ? '(paid for others)' : '',
        item.courseTitle ? `Course: ${item.courseTitle}` : '',
      ].filter(Boolean)
      p2.drawText(fmtDateRange(item.start_date, item.end_date), { x: MARGIN, y: dy, size: 8, font })
      const amt = money(item.amount)
      p2.drawText(amt, { x: PAGE_W - MARGIN - font.widthOfTextAtSize(amt, 8), y: dy, size: 8, font })
      for (const line of lines) {
        p2.drawText(truncate(font, line, 8, PAGE_W - 2 * MARGIN - 150), { x: MARGIN + 90, y: dy, size: 8, font })
        dy -= 11
      }
      dy -= 6
      p2.drawLine({ start: { x: MARGIN, y: dy + 4 }, end: { x: PAGE_W - MARGIN, y: dy + 4 }, thickness: 0.4, color: LIGHT })
      dy -= 8
      if (dy < MARGIN + 20) break // extremely long detail lists get clipped rather than paginated
    }
  }

  return doc.save()
}
