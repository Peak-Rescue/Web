// The page furniture every Peak Rescue handout shares: letter portrait, one
// typeface, a red hairline for the brand, a running head on continuation
// pages and a numbered footer.
//
// It exists so the gear list and the running order are visibly the same
// document family. They are handed to the same people on the same course, and
// two PDFs built independently drift into two different-looking things within
// a couple of edits.
//
// The builder owns the cursor and the page breaks. A caller says "I need 40
// points for this block" and then draws; it never works out which page it is
// on, which is what keeps a day of a schedule from being split across a break
// halfway through its title.

import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from 'pdf-lib'
import { wrap, wrapParagraphs, winAnsiSafe } from '@/lib/pdf-text'

export const PAGE_W = 612
export const PAGE_H = 792
export const MARGIN = 54
export const CONTENT_W = PAGE_W - MARGIN * 2

export const INK = rgb(0.1, 0.1, 0.11)
export const MUTED = rgb(0.42, 0.42, 0.45)
export const FAINT = rgb(0.58, 0.58, 0.61)
export const HAIRLINE = rgb(0.85, 0.85, 0.87)
export const RED = rgb(0.8, 0.12, 0.1) // --color-pr-red

const FOOTER_H = 44
const HEAD_H = 40 // running head on continuation pages

export type DocMeta = {
  // The big line on page one — the course, as its people call it.
  title: string
  // Dates, location, client: the line under the title. Optional.
  subtitle?: string | null
  // What this document is: "Gear list", "Running order". Rides the running
  // head and the footer so a loose page still says what it came from.
  kind: string
}

export class PdfBuilder {
  readonly doc: PDFDocument
  readonly font: PDFFont
  readonly bold: PDFFont
  readonly meta: DocMeta
  page!: PDFPage
  y = 0
  // What to redraw at the top of a continuation page: the heading the broken
  // run was under. Without it a gear list that spills over becomes a column of
  // ticks belonging to nothing — which section they were under is exactly the
  // information a page break destroys. Callers set it when they open a run and
  // clear it when they close one.
  continued: (() => void) | null = null
  private breaking = false

  private constructor(doc: PDFDocument, font: PDFFont, bold: PDFFont, meta: DocMeta) {
    this.doc = doc
    this.font = font
    this.bold = bold
    this.meta = meta
  }

  static async create(meta: DocMeta): Promise<PdfBuilder> {
    const doc = await PDFDocument.create()
    const font = await doc.embedFont(StandardFonts.Helvetica)
    const bold = await doc.embedFont(StandardFonts.HelveticaBold)
    const b = new PdfBuilder(doc, font, bold, meta)
    doc.setTitle(`${meta.title} — ${meta.kind}`)
    b.newPage(true)
    return b
  }

  // ── Pages ─────────────────────────────────────────────────────────────────

  private newPage(first: boolean) {
    this.page = this.doc.addPage([PAGE_W, PAGE_H])
    this.y = PAGE_H - MARGIN

    if (first) {
      // A short red rule instead of a logo: it reads as ours at a glance and
      // survives a black-and-white printer, which is what most of these meet.
      this.page.drawRectangle({ x: MARGIN, y: this.y - 4, width: 34, height: 2.5, color: RED })
      this.y -= 24

      const title = winAnsiSafe(this.bold, this.meta.title)
      for (const line of wrap(this.bold, title, 18, CONTENT_W)) {
        this.page.drawText(line, { x: MARGIN, y: this.y, size: 18, font: this.bold, color: INK })
        this.y -= 22
      }
      this.y += 4

      const sub = [this.meta.kind, this.meta.subtitle].filter(Boolean).join('  ·  ')
      this.y -= 13
      this.page.drawText(winAnsiSafe(this.font, sub), { x: MARGIN, y: this.y, size: 9.5, font: this.font, color: MUTED })
      this.y -= 16
      this.hairline()
      this.y -= 20
      return
    }

    const head = winAnsiSafe(this.font, `${this.meta.title} — ${this.meta.kind}`)
    this.page.drawText(head, { x: MARGIN, y: this.y - 8, size: 8.5, font: this.font, color: FAINT })
    this.y -= 18
    this.hairline()
    this.y -= HEAD_H - 18
    // The callback draws with the cursor, so it must not be able to ask for a
    // page break of its own — it is already on a fresh page, and a second
    // break here would recurse.
    if (this.continued && !this.breaking) {
      this.breaking = true
      try { this.continued() } finally { this.breaking = false }
    }
  }

  // Guarantees `height` points of room below the cursor, breaking first if
  // there isn't any. Everything that draws more than a line calls this with
  // the height of the whole block, so a heading never lands alone at the foot
  // of a page.
  ensure(height: number) {
    if (this.breaking) return
    if (this.y - height < MARGIN + FOOTER_H) this.newPage(false)
  }

  // ── Marks ─────────────────────────────────────────────────────────────────

  hairline(opts?: { x?: number; width?: number; color?: ReturnType<typeof rgb> }) {
    const x = opts?.x ?? MARGIN
    this.page.drawLine({
      start: { x, y: this.y },
      end: { x: x + (opts?.width ?? CONTENT_W), y: this.y },
      thickness: 0.6,
      color: opts?.color ?? HAIRLINE,
    })
  }

  text(
    value: string,
    opts?: { x?: number; size?: number; bold?: boolean; color?: ReturnType<typeof rgb>; y?: number }
  ) {
    const size = opts?.size ?? 10
    const font = opts?.bold ? this.bold : this.font
    this.page.drawText(winAnsiSafe(font, value), {
      x: opts?.x ?? MARGIN,
      y: opts?.y ?? this.y,
      size,
      font,
      color: opts?.color ?? INK,
    })
  }

  // Prose that wraps and moves the cursor down past itself. Returns the height
  // it used, so a caller measuring a block can ask a sibling how tall it was.
  paragraph(
    value: string,
    opts?: { x?: number; width?: number; size?: number; leading?: number; color?: ReturnType<typeof rgb>; bold?: boolean; paragraphs?: boolean }
  ): number {
    const size = opts?.size ?? 10
    const leading = opts?.leading ?? size * 1.45
    const font = opts?.bold ? this.bold : this.font
    const x = opts?.x ?? MARGIN
    const width = opts?.width ?? CONTENT_W
    const lines = opts?.paragraphs
      ? wrapParagraphs(font, value, size, width)
      : wrap(font, value, size, width)
    const start = this.y
    for (const line of lines) {
      this.ensure(leading)
      if (line) this.text(line, { x, size, color: opts?.color, bold: opts?.bold })
      this.y -= leading
    }
    return start - this.y
  }

  // How tall `paragraph` would be, for a caller that has to reserve the whole
  // block before drawing any of it.
  measure(value: string, opts?: { width?: number; size?: number; leading?: number; bold?: boolean; paragraphs?: boolean }): number {
    const size = opts?.size ?? 10
    const leading = opts?.leading ?? size * 1.45
    const font = opts?.bold ? this.bold : this.font
    const width = opts?.width ?? CONTENT_W
    const lines = opts?.paragraphs
      ? wrapParagraphs(font, value, size, width)
      : wrap(font, value, size, width)
    return lines.length * leading
  }

  // A major division — "Each person brings", "Day 2". Kept with at least the
  // first couple of lines of whatever follows it.
  sectionHeading(value: string, opts?: { keepWith?: number }) {
    this.ensure(20 + (opts?.keepWith ?? 28))
    this.text(value.toUpperCase(), { size: 9, bold: true, color: INK })
    this.y -= 6
    this.hairline()
    this.y -= 14
  }

  // ── Output ────────────────────────────────────────────────────────────────

  async save(): Promise<Uint8Array> {
    const pages = this.doc.getPages()
    pages.forEach((page, i) => {
      const left = winAnsiSafe(this.font, 'Peak Rescue')
      page.drawText(left, { x: MARGIN, y: MARGIN - 4, size: 7.5, font: this.font, color: FAINT })
      const right = `${i + 1} / ${pages.length}`
      page.drawText(right, {
        x: PAGE_W - MARGIN - this.font.widthOfTextAtSize(right, 7.5),
        y: MARGIN - 4,
        size: 7.5,
        font: this.font,
        color: FAINT,
      })
      page.drawLine({
        start: { x: MARGIN, y: MARGIN + 8 },
        end: { x: PAGE_W - MARGIN, y: MARGIN + 8 },
        thickness: 0.6,
        color: HAIRLINE,
      })
    })
    return this.doc.save()
  }
}
