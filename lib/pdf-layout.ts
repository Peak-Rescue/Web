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

import { PDFDocument, PDFFont, PDFImage, PDFPage, StandardFonts, rgb, setCharacterSpacing } from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'
import { wrap, wrapParagraphs, winAnsiSafe } from '@/lib/pdf-text'
import { BARLOW_BOLD_TTF_BASE64, LOGO_DARK_JPG_BASE64 } from '@/lib/pdf-brand-assets'

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
  // The website's hero, on paper, on everything of ours that isn't a signed
  // record or somebody else's form: a black band across the top of page one with
  // the colour logo, a red eyebrow and the heading in the site's display face.
  // Replaces the title block and the red rule. Section headings become the
  // site's red tracked labels to match.
  masthead?: Masthead
}

export type Masthead = {
  eyebrow: string
  heading: string
  // Under the heading, first one brightest.
  lines: string[]
  // Small, bottom of the band: a reference number.
  ref?: string | null
}

const BAND_H = 158
const BAND = rgb(0, 0, 0) // the colour logo's own background, so it has no edge
const ON_BAND = rgb(0.83, 0.83, 0.85)
const ON_BAND_DIM = rgb(0.55, 0.55, 0.58)
export const PANEL = rgb(0.955, 0.955, 0.96)

export class PdfBuilder {
  readonly doc: PDFDocument
  readonly font: PDFFont
  readonly bold: PDFFont
  readonly meta: DocMeta
  private bandLogo: PDFImage | null = null
  // Barlow Condensed Bold when there is a masthead, for the few big lines that
  // carry the brand. Body text stays Helvetica: the face is condensed display
  // type and reads poorly as paragraphs.
  display: PDFFont | null = null
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
    if (meta.masthead) {
      doc.registerFontkit(fontkit)
      b.display = await doc.embedFont(BARLOW_BOLD_TTF_BASE64, { subset: true })
      b.bandLogo = await doc.embedJpg(LOGO_DARK_JPG_BASE64)
    }
    doc.setTitle(`${meta.title} — ${meta.kind}`)
    b.newPage(true)
    return b
  }

  // ── Pages ─────────────────────────────────────────────────────────────────

  private newPage(first: boolean) {
    this.page = this.doc.addPage([PAGE_W, PAGE_H])
    this.y = PAGE_H - MARGIN

    if (first && this.meta.masthead) {
      this.drawMasthead(this.meta.masthead)
      return
    }

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

  private drawMasthead(m: Masthead) {
    const top = PAGE_H
    this.page.drawRectangle({ x: 0, y: top - BAND_H, width: PAGE_W, height: BAND_H, color: BAND })
    // The red corner bracket from the site's hero.
    this.page.drawRectangle({ x: 0, y: top - 3, width: 52, height: 3, color: RED })
    this.page.drawRectangle({ x: 0, y: top - 52, width: 3, height: 52, color: RED })

    let textW = CONTENT_W
    if (this.bandLogo) {
      const h = 66
      const w = (this.bandLogo.width / this.bandLogo.height) * h
      this.page.drawImage(this.bandLogo, {
        x: MARGIN + CONTENT_W - w,
        y: top - BAND_H / 2 - h / 2,
        width: w,
        height: h,
      })
      textW = CONTENT_W - w - 24
    }

    let y = top - 46
    // Course names run long and the band doesn't grow, so what can't fit stops
    // short of the logo and the edge of the band instead of running into them.
    const eyebrow = m.eyebrow.toUpperCase()
    const tracking = 1.6
    const eyebrowFits = (s: string) => this.bold.widthOfTextAtSize(winAnsiSafe(this.bold, s), 8.5) + s.length * tracking <= textW
    let shown = eyebrow
    while (!eyebrowFits(shown) && shown.length > 1) shown = shown.slice(0, -2).trimEnd() + '…'
    this.tracked(shown, { x: MARGIN, y, size: 8.5, color: RED, spacing: tracking })
    y -= 32
    const display = this.display ?? this.bold
    const heading = winAnsiSafe(display, m.heading)
    const headingSize = Math.max(18, Math.min(32, 32 * textW / display.widthOfTextAtSize(heading, 32)))
    this.page.drawText(heading, { x: MARGIN, y, size: headingSize, font: display, color: rgb(1, 1, 1) })
    y -= 22
    const floor = top - BAND_H + (m.ref ? 30 : 14)
    m.lines.forEach((line, i) => {
      const size = i === 0 ? 11 : 9.5
      for (const l of wrap(i === 0 ? this.bold : this.font, line, size, textW).slice(0, 2)) {
        if (y < floor) return
        this.page.drawText(l, { x: MARGIN, y, size, font: i === 0 ? this.bold : this.font, color: i === 0 ? ON_BAND : ON_BAND_DIM })
        y -= size * 1.5
      }
    })
    if (m.ref) {
      this.tracked(m.ref, { x: MARGIN, y: top - BAND_H + 16, size: 7.5, color: ON_BAND_DIM, spacing: 0.8 })
    }

    this.y = top - BAND_H - 34
  }

  // Letterspaced caps — the site's eyebrow and section labels. pdf-lib has no
  // spacing option on drawText, so the operator is set around the one draw.
  tracked(
    value: string,
    opts: { x?: number; y?: number; size: number; color?: ReturnType<typeof rgb>; spacing: number; bold?: boolean }
  ) {
    const font = opts.bold === false ? this.font : this.bold
    this.page.pushOperators(setCharacterSpacing(opts.spacing))
    this.page.drawText(winAnsiSafe(font, value), {
      x: opts.x ?? MARGIN,
      y: opts.y ?? this.y,
      size: opts.size,
      font,
      color: opts.color ?? INK,
    })
    this.page.pushOperators(setCharacterSpacing(0))
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
    if (this.meta.masthead) {
      this.tracked(value.toUpperCase(), { size: 8.5, color: RED, spacing: 1.6 })
      this.y -= 18
      return
    }
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
