// Reading a CSV somebody downloaded from a bank.
//
// Written rather than installed because the job is small and the failure mode
// of getting it wrong is silent: a quoted description containing a comma —
// "SHELL OIL 1234, CASPER WY" — split naively puts the amount one column to
// the right, and every row after it is wrong in a way that still looks like a
// table. So: quotes, escaped quotes, embedded commas and newlines, CRLF, and
// the byte-order mark Excel writes at the front of anything it exports.

/** Rows of cells, exactly as the file has them. No interpretation: every cell
    is a string, empty cells included, so the caller can decide what a column
    means. */
export function parseCsv(text: string, delimiter = ','): string[][] {
  // Excel's BOM is invisible everywhere except in a comparison against the
  // first header name, where it makes "Date" not equal "Date".
  const input = text.replace(/^﻿/, '')
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false

  for (let i = 0; i < input.length; i++) {
    const c = input[i]
    if (quoted) {
      if (c === '"') {
        // "" inside a quoted field is one literal quote.
        if (input[i + 1] === '"') {
          cell += '"'
          i++
        } else {
          quoted = false
        }
      } else {
        cell += c
      }
      continue
    }
    if (c === '"') {
      quoted = true
    } else if (c === delimiter) {
      row.push(cell)
      cell = ''
    } else if (c === '\n' || c === '\r') {
      // A bare \r, a bare \n and \r\n all end one row and no more than one.
      if (c === '\r' && input[i + 1] === '\n') i++
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
    } else {
      cell += c
    }
  }
  if (cell !== '' || row.length > 0) {
    row.push(cell)
    rows.push(row)
  }
  // A trailing newline is not a row of one empty cell.
  return rows.filter((r) => r.some((v) => v.trim() !== ''))
}

/** Which delimiter the file actually uses. Some exports are semicolon- or
    tab-separated and still called .csv; the giveaway is which character
    produces the same column count on every line rather than which one is
    most common — a description full of commas would win a popularity contest
    in a semicolon-separated file. */
export function sniffDelimiter(text: string): string {
  const sample = text.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim() !== '').slice(0, 10)
  if (sample.length === 0) return ','
  let best = ','
  let bestScore = -1
  for (const d of [',', ';', '\t', '|']) {
    const counts = sample.map((l) => parseCsv(l, d)[0]?.length ?? 1)
    const columns = counts[0] ?? 1
    if (columns < 2) continue
    const consistent = counts.filter((c) => c === columns).length
    const score = consistent * 100 + columns
    if (score > bestScore) {
      bestScore = score
      best = d
    }
  }
  return best
}

export type CsvTable = {
  headers: string[]
  rows: string[][]
  /** How many lines above the header were preamble — an account name, a date
      range, a blank. Reported so the import screen can say it skipped them
      rather than appearing to have lost them. */
  skippedLines: number
}

/** The header row and the rows under it.

    Banks put things above the header: the account name, the statement period,
    a blank line. So the header is not simply the first line — it is the first
    line that looks like labels rather than data, has at least two columns,
    and is followed by a line with the same number of them. */
export function tableFromCsv(text: string): CsvTable | null {
  const rows = parseCsv(text, sniffDelimiter(text))
  if (rows.length === 0) return null

  const looksLikeData = (r: string[]) => r.some((c) => /^\s*[-(]?[$€£]?\s*[\d,]+\.\d{2}\)?\s*$/.test(c))

  for (let i = 0; i < Math.min(rows.length - 1, 12); i++) {
    const candidate = rows[i]
    if (candidate.length < 2) continue
    if (looksLikeData(candidate)) continue
    if (candidate.filter((c) => c.trim() !== '').length < 2) continue
    if (rows[i + 1].length !== candidate.length) continue
    return {
      headers: candidate.map((h) => h.trim()),
      rows: rows.slice(i + 1).filter((r) => r.length === candidate.length),
      skippedLines: i,
    }
  }

  // Nothing looked like a header: treat the first row as one anyway rather
  // than refusing the file, because the mapping step is about to ask a person
  // which column is which regardless.
  return { headers: rows[0].map((h) => h.trim()), rows: rows.slice(1), skippedLines: 0 }
}
