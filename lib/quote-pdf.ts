// Peak Rescue-branded quote PDF, following the structure of the real quote
// documents (cover → course overview → quote page → commitment letter),
// rendered as a clean print-friendly version of the black/red/white template.

import { readFile } from 'fs/promises'
import path from 'path'
import { PDFDocument, PDFFont, PDFImage, PDFPage, StandardFonts, rgb } from 'pdf-lib'
import { QUOTE_MISSION, QUOTE_COMMITMENT, QUOTE_CONTACT, quoteNumber } from '@/lib/quotes'

export type QuotePdfData = {
  refNumber: number
  quoteSeq: number
  courseName: string
  courseTypeLabel: string
  clientName: string | null
  location: string | null
  datesLabel: string
  issueDate: string // yyyy-mm-dd
  validUntil: string | null
  total: number
  unitRateNote: string | null
  scopeBullets: string[]
  courseBlurb: string | null
  preparedByName: string | null
  preparedByEmail: string | null
}

const W = 612
const H = 792
const M = 64
const RED = rgb(0.8, 0.12, 0.1)
const BLACK = rgb(0.08, 0.08, 0.08)
const GRAY = rgb(0.45, 0.45, 0.45)

function money(n: number): string {
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })
}

function fmtDate(d: string): string {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
}

function wrap(font: PDFFont, text: string, size: number, maxW: number): string[] {
  const words = text.split(/\s+/)
  const lines: string[] = []
  let line = ''
  for (const word of words) {
    const test = line ? `${line} ${word}` : word
    if (font.widthOfTextAtSize(test, size) > maxW && line) {
      lines.push(line)
      line = word
    } else {
      line = test
    }
  }
  if (line) lines.push(line)
  return lines
}

function para(page: PDFPage, font: PDFFont, text: string, x: number, y: number, size: number, maxW: number, lineGap = 1.45, color = BLACK): number {
  let cursor = y
  for (const line of wrap(font, text, size, maxW)) {
    page.drawText(line, { x, y: cursor, size, font, color })
    cursor -= size * lineGap
  }
  return cursor
}

export async function generateQuotePdf(q: QuotePdfData): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)

  let logo: PDFImage | null = null
  try {
    const bytes = await readFile(path.join(process.cwd(), 'public', 'logo-color.jpg'))
    logo = await doc.embedJpg(bytes)
  } catch {
    // Logo missing — the PDF still renders with the text wordmark.
  }

  const qNum = quoteNumber(q.refNumber, q.quoteSeq)

  const header = (page: PDFPage) => {
    if (logo) {
      const dims = logo.scaleToFit(120, 44)
      page.drawImage(logo, { x: M, y: H - 44 - dims.height / 2, width: dims.width, height: dims.height })
    } else {
      page.drawText('PEAK RESCUE', { x: M, y: H - 56, size: 16, font: bold, color: BLACK })
    }
    page.drawText(qNum, { x: W - M - font.widthOfTextAtSize(qNum, 9), y: H - 52, size: 9, font, color: GRAY })
    page.drawLine({ start: { x: M, y: H - 76 }, end: { x: W - M, y: H - 76 }, thickness: 2, color: RED })
  }

  // ── Page 1 — Cover ──────────────────────────────────────────────────────────
  const p1 = doc.addPage([W, H])
  header(p1)
  p1.drawRectangle({ x: 0, y: 0, width: 10, height: H, color: RED })

  p1.drawText(q.courseTypeLabel.toUpperCase(), { x: M, y: H - 300, size: 13, font: bold, color: RED })
  let y = H - 336
  for (const line of wrap(bold, 'PEAK RESCUE QUOTE', 40, W - 2 * M)) {
    p1.drawText(line, { x: M, y, size: 40, font: bold, color: BLACK })
    y -= 48
  }
  y -= 6
  p1.drawText(`DATES  ${q.datesLabel.toUpperCase()}`, { x: M, y, size: 13, font: bold, color: BLACK })
  y -= 40
  p1.drawText('Prepared for', { x: M, y, size: 11, font, color: GRAY })
  y -= 20
  p1.drawText(q.clientName ?? '—', { x: M, y, size: 18, font: bold, color: BLACK })
  if (q.location) {
    y -= 22
    p1.drawText(q.location, { x: M, y, size: 12, font, color: GRAY })
  }

  p1.drawText(`Prepared ${fmtDate(q.issueDate)}`, { x: M, y: 96, size: 10, font, color: GRAY })
  p1.drawText(`Quote ${qNum}`, { x: M, y: 80, size: 10, font, color: GRAY })

  // ── Page 2 — Course overview ────────────────────────────────────────────────
  if (q.courseBlurb?.trim()) {
    const p2 = doc.addPage([W, H])
    header(p2)
    p2.drawText(q.courseName, { x: M, y: H - 140, size: 24, font: bold, color: BLACK })
    para(p2, font, q.courseBlurb.trim(), M, H - 180, 11.5, W - 2 * M)
  }

  // ── Page 3 — The quote ──────────────────────────────────────────────────────
  const p3 = doc.addPage([W, H])
  header(p3)
  p3.drawText('QUOTE', { x: M, y: H - 140, size: 24, font: bold, color: BLACK })

  p3.drawText('TOTAL PRICE', { x: M, y: H - 190, size: 11, font: bold, color: RED })
  p3.drawText(money(q.total), { x: M, y: H - 232, size: 34, font: bold, color: BLACK })
  let y3 = H - 258
  if (q.unitRateNote?.trim()) {
    p3.drawText(q.unitRateNote.trim(), { x: M, y: y3, size: 11, font, color: GRAY })
    y3 -= 26
  }
  y3 -= 8
  for (const bullet of q.scopeBullets.filter((b) => b.trim())) {
    y3 = para(p3, font, `•  ${bullet.trim()}`, M, y3, 11.5, W - 2 * M - 20) - 4
  }

  if (q.validUntil) {
    y3 -= 12
    p3.drawText(`This quote is valid through ${fmtDate(q.validUntil)}.`, { x: M, y: y3, size: 10, font, color: GRAY })
  }

  // Our company + contact at the bottom.
  let yc = 236
  p3.drawText('OUR COMPANY', { x: M, y: yc, size: 11, font: bold, color: RED })
  yc = para(p3, font, QUOTE_MISSION, M, yc - 20, 10.5, W - 2 * M)
  yc -= 14
  p3.drawText('CONTACT US', { x: M, y: yc, size: 11, font: bold, color: RED })
  yc -= 20
  const contactLines = [
    q.preparedByName,
    q.preparedByEmail,
    QUOTE_CONTACT.phone,
    QUOTE_CONTACT.website,
  ].filter((v): v is string => Boolean(v))
  for (const line of contactLines) {
    p3.drawText(line, { x: M, y: yc, size: 10.5, font, color: BLACK })
    yc -= 16
  }

  // ── Page 4 — Commitment ─────────────────────────────────────────────────────
  const p4 = doc.addPage([W, H])
  header(p4)
  p4.drawText('Our Commitment to You', { x: M, y: H - 140, size: 24, font: bold, color: BLACK })
  let y4 = para(p4, font, QUOTE_COMMITMENT, M, H - 180, 11.5, W - 2 * M)
  y4 -= 48
  if (q.preparedByName) {
    p4.drawText(q.preparedByName, { x: M, y: y4, size: 12, font: bold, color: BLACK })
    y4 -= 16
    p4.drawText('Peak Rescue Mountain Guides', { x: M, y: y4, size: 10.5, font, color: GRAY })
  }

  return doc.save()
}
