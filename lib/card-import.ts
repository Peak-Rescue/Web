// Turning a card export into charges the books can use.
//
// No format is assumed, because there is no format: every bank names its
// columns differently, half of them sign purchases positive and half
// negative, some split debit and credit into two columns, and the date is
// written four ways. Rather than hard-code one card's export and discover
// next year that the bank changed it, this guesses — and every guess is shown
// to the person importing, who corrects it before anything is written.
//
// So the rules below are all suggestions. The import screen is the authority;
// this is what fills it in before they look.

import { round2 } from '@/lib/expenses'
import { type CsvTable } from '@/lib/csv'

export type ColumnMap = {
  date: number | null
  description: number | null
  /** One signed column — the usual shape. */
  amount: number | null
  /** Or two columns, money out and money in. When either is set the single
      amount column is ignored: a file that has both has them for a reason. */
  debit: number | null
  credit: number | null
  cardholder: number | null
}

const EMPTY_MAP: ColumnMap = { date: null, description: null, amount: null, debit: null, credit: null, cardholder: null }

// Which header wins a role, most specific first. "Transaction date" beats
// "Posted date" on purpose: the date the money was spent is the one that says
// which course it belongs to, and a charge posting three days later has
// crossed the end of a course more than once.
const PATTERNS: { role: keyof ColumnMap; tests: RegExp[] }[] = [
  {
    role: 'date',
    tests: [/transaction\s*date/i, /purchase\s*date/i, /post(ed|ing)?\s*date/i, /^date$/i, /date/i],
  },
  {
    role: 'description',
    tests: [/description/i, /merchant/i, /payee/i, /narrative/i, /details?/i, /memo/i, /^name$/i],
  },
  {
    role: 'cardholder',
    tests: [/card\s*(member|holder)/i, /employee/i, /name\s*on\s*card/i, /last\s*4/i, /card\s*(no|number|nickname)/i],
  },
  { role: 'debit', tests: [/debit/i, /withdrawal/i, /charges?$/i, /money\s*out/i] },
  { role: 'credit', tests: [/credit/i, /deposit/i, /money\s*in/i, /payments?$/i] },
  { role: 'amount', tests: [/^amount$/i, /transaction\s*amount/i, /amount/i] },
]

/** A first answer to "which column is which", from the header names alone.
    Every role is filled by the best-matching unclaimed column, so a file with
    both "Transaction Date" and "Posted Date" does not put the same column in
    two places. */
export function guessColumns(headers: string[]): ColumnMap {
  const map: ColumnMap = { ...EMPTY_MAP }
  const taken = new Set<number>()
  for (const { role, tests } of PATTERNS) {
    for (const test of tests) {
      const i = headers.findIndex((h, idx) => !taken.has(idx) && test.test(h.trim()))
      if (i !== -1) {
        map[role] = i
        taken.add(i)
        break
      }
    }
  }
  // A file with separate debit and credit columns has no use for a third,
  // signed one — and "Credit" alone is usually a card's own word for the
  // whole amount column, not a second column.
  if (map.debit === null && map.credit !== null && map.amount === null) {
    map.amount = map.credit
    map.credit = null
  }
  return map
}

/** An amount as a bank writes one: `$1,234.56`, `(45.00)` for a credit,
    `45.00-` for the same thing, a bare number. Null when the cell holds no
    number at all, which is how a subtotal row or a footer is spotted. */
export function parseAmount(raw: string): number | null {
  const text = String(raw ?? '').trim()
  if (text === '') return null
  const negative = /^\(.*\)$/.test(text) || /-\s*$/.test(text) || /^\s*-/.test(text)
  const digits = text.replace(/[^0-9.]/g, '')
  if (digits === '' || !/\d/.test(digits)) return null
  const n = Number(digits)
  if (!Number.isFinite(n)) return null
  return round2(negative ? -n : n)
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']

/** A date as a bank writes one, as YYYY-MM-DD. Handles ISO, `9/3/2026`,
    `09/03/26`, `3-Sep-2026` and `Sep 3, 2026`.

    `dayFirst` settles the ambiguity no format can: 03/09 is two different days
    depending on which side of the Atlantic wrote it, and nothing in the cell
    says which. It is decided once for the whole file — see `detectDayFirst` —
    rather than per row, because a file cannot be half one and half the other. */
export function parseDate(raw: string, dayFirst = false): string | null {
  const text = String(raw ?? '').trim()
  if (text === '') return null

  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`

  const slashed = text.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/)
  if (slashed) {
    const a = Number(slashed[1])
    const b = Number(slashed[2])
    const month = dayFirst ? b : a
    const day = dayFirst ? a : b
    return isoFrom(Number(slashed[3]), month, day)
  }

  const named = text.match(/^(\d{1,2})[\s\-/]*([A-Za-z]{3,})[\s\-/,]*(\d{2,4})$/)
  if (named) {
    const month = MONTHS.indexOf(named[2].slice(0, 3).toLowerCase()) + 1
    if (month > 0) return isoFrom(Number(named[3]), month, Number(named[1]))
  }

  const nameFirst = text.match(/^([A-Za-z]{3,})[\s\-/]*(\d{1,2})[\s,\-/]*(\d{2,4})$/)
  if (nameFirst) {
    const month = MONTHS.indexOf(nameFirst[1].slice(0, 3).toLowerCase()) + 1
    if (month > 0) return isoFrom(Number(nameFirst[3]), month, Number(nameFirst[2]))
  }

  return null
}

function isoFrom(year: number, month: number, day: number): string | null {
  // A two-digit year is this century: card exports do not reach back to 1998,
  // and guessing forward would date a charge in the future.
  const y = year < 100 ? 2000 + year : year
  if (month < 1 || month > 12 || day < 1 || day > 31) return null
  return `${y}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

/** Whether the file writes the day before the month. Proof beats preference:
    a single `13/09` settles it, because no month is the thirteenth. Without
    proof it stays false — this is an American company with an American card,
    and a wrong guess here is a charge filed to the wrong course, not a
    parse error somebody would notice. */
export function detectDayFirst(values: string[]): boolean {
  for (const v of values) {
    const m = String(v ?? '').trim().match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.]\d{2,4}$/)
    if (!m) continue
    const a = Number(m[1])
    const b = Number(m[2])
    if (a > 12 && b <= 12) return true
    if (b > 12 && a <= 12) return false
  }
  return false
}

export type MappedRow = {
  posted_date: string
  description: string
  amount: number
  cardholder: string | null
  raw: Record<string, string>
}

export type MapResult = {
  rows: MappedRow[]
  /** Rows that could not be read, with the reason — a subtotal line, a blank
      date, a footer. Surfaced rather than dropped: "38 of 40 rows" needs the
      other two named, or the import quietly loses money. */
  rejected: { line: number; reason: string; raw: Record<string, string> }[]
}

/** The file's rows as charges, by the mapping a person confirmed.

    Money out is positive throughout, whatever the file's own convention: a
    purchase and a refund have to add up, and the sign they add up with is
    decided here rather than in every reader downstream. */
export function mapRows(
  table: CsvTable,
  map: ColumnMap,
  opts: { flipSign?: boolean; dayFirst?: boolean } = {}
): MapResult {
  const rows: MappedRow[] = []
  const rejected: MapResult['rejected'] = []

  table.rows.forEach((cells, i) => {
    const raw: Record<string, string> = {}
    table.headers.forEach((h, idx) => {
      raw[h || `column ${idx + 1}`] = cells[idx] ?? ''
    })

    const at = (idx: number | null) => (idx === null ? '' : (cells[idx] ?? ''))
    const date = parseDate(at(map.date), opts.dayFirst ?? false)
    if (!date) {
      rejected.push({ line: i + 1, reason: 'no date the importer could read', raw })
      return
    }

    let amount: number | null
    if (map.debit !== null || map.credit !== null) {
      // Two columns: whichever one this row filled in. Money out is the debit.
      const out = parseAmount(at(map.debit))
      const back = parseAmount(at(map.credit))
      amount = out !== null && out !== 0 ? Math.abs(out) : back !== null && back !== 0 ? -Math.abs(back) : null
    } else {
      amount = parseAmount(at(map.amount))
    }
    if (amount === null) {
      rejected.push({ line: i + 1, reason: 'no amount the importer could read', raw })
      return
    }
    if (opts.flipSign && (map.debit === null && map.credit === null)) amount = round2(-amount)

    const description = at(map.description).trim() || '(no description)'
    const cardholder = at(map.cardholder).trim() || null
    rows.push({ posted_date: date, description, amount, cardholder, raw })
  })

  return { rows, rejected }
}

/** Whether the file signs purchases negative — most exports do, listing a
    charge as money leaving. Decided by which way the bulk of the money runs,
    not by the first row: a statement opens with a payment as often as not. */
export function suggestFlipSign(amounts: number[]): boolean {
  const spent = amounts.filter((a) => a !== 0)
  if (spent.length === 0) return false
  const negative = spent.filter((a) => a < 0).length
  return negative > spent.length / 2
}

/** What makes this charge that charge, across two imports of statements that
    overlap. Date, amount, description and card, plus which occurrence it is
    within its own file — so the same statement imported twice brings nothing
    new, while two identical $4 coffees on one Tuesday stay two charges. */
export function fingerprintOf(row: MappedRow, occurrence: number): string {
  const key = [
    row.posted_date,
    row.amount.toFixed(2),
    row.description.toLowerCase().replace(/\s+/g, ' ').trim(),
    (row.cardholder ?? '').toLowerCase().trim(),
    `#${occurrence}`,
  ]
  return key.join('|')
}

/** The rows with their fingerprints, counting repeats as they go. */
export function withFingerprints(rows: MappedRow[]): (MappedRow & { fingerprint: string })[] {
  const seen = new Map<string, number>()
  return rows.map((r) => {
    const base = fingerprintOf(r, 1).replace(/\|#1$/, '')
    const n = (seen.get(base) ?? 0) + 1
    seen.set(base, n)
    return { ...r, fingerprint: fingerprintOf(r, n) }
  })
}
