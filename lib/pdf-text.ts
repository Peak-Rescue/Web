// Text handling shared by every PDF we generate.
//
// The standard fonts use WinAnsi encoding, which rejects control characters
// and anything beyond Latin-1-ish text — one stray newline or emoji in a note
// would otherwise fail the whole document. Everything here goes through
// winAnsiSafe first, so a character we can't draw costs that character rather
// than the PDF.

import { PDFFont } from 'pdf-lib'

export function winAnsiSafe(font: PDFFont, text: string): string {
  return Array.from(text.replace(/\s+/g, ' '))
    .filter((ch) => {
      try {
        font.widthOfTextAtSize(ch, 8)
        return true
      } catch {
        return false
      }
    })
    .join('')
}

export function truncate(font: PDFFont, text: string, size: number, maxW: number): string {
  text = winAnsiSafe(font, text)
  if (font.widthOfTextAtSize(text, size) <= maxW) return text
  let t = text
  while (t.length > 1 && font.widthOfTextAtSize(t + '…', size) > maxW) t = t.slice(0, -1)
  return t + '…'
}

// Breaks a paragraph to a column width. Truncation is the wrong answer for a
// gear note or a day's notes — they are prose someone wrote to be read, and
// the page has room below, so they wrap instead of getting a "…".
//
// A single word longer than the column (a pasted URL) is cut rather than
// allowed to run off the edge, since there is nowhere for it to break.
export function wrap(font: PDFFont, text: string, size: number, maxW: number): string[] {
  const words = winAnsiSafe(font, text).split(' ').filter(Boolean)
  const lines: string[] = []
  let line = ''
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word
    if (font.widthOfTextAtSize(candidate, size) <= maxW) {
      line = candidate
      continue
    }
    if (line) lines.push(line)
    if (font.widthOfTextAtSize(word, size) > maxW) {
      lines.push(truncate(font, word, size, maxW))
      line = ''
    } else {
      line = word
    }
  }
  if (line) lines.push(line)
  return lines.length > 0 ? lines : ['']
}

// Paragraphs the author separated with newlines stay separated. Callers hand
// us the raw column, because a schedule overview typed as three paragraphs
// reads as one wall of text if the breaks are collapsed on the way in.
export function wrapParagraphs(font: PDFFont, text: string, size: number, maxW: number): string[] {
  return text
    .split(/\n+/)
    .map((p) => p.trim())
    .filter(Boolean)
    .flatMap((p, i) => (i === 0 ? [] : ['']).concat(wrap(font, p, size, maxW)))
}
