import { describe, it, expect } from 'vitest'
import { parseCsv, sniffDelimiter, tableFromCsv } from '@/lib/csv'
import {
  guessColumns,
  parseAmount,
  parseDate,
  detectDayFirst,
  mapRows,
  suggestFlipSign,
  withFingerprints,
} from '@/lib/card-import'

describe('reading the file', () => {
  it('keeps a comma that is inside a description', () => {
    const rows = parseCsv('Date,Description,Amount\n09/03/2026,"SHELL OIL 1234, CASPER WY",64.20\n')
    expect(rows[1]).toEqual(['09/03/2026', 'SHELL OIL 1234, CASPER WY', '64.20'])
  })

  it('reads a doubled quote as one quote', () => {
    expect(parseCsv('a\n"BOB""S DINER"\n')[1]).toEqual(['BOB"S DINER'])
  })

  it('survives what Excel writes: a byte-order mark and CRLF', () => {
    const table = tableFromCsv('﻿Date,Amount\r\n2026-09-03,12.00\r\n')
    expect(table?.headers).toEqual(['Date', 'Amount'])
    expect(table?.rows).toEqual([['2026-09-03', '12.00']])
  })

  it('finds the header under a bank’s preamble', () => {
    const table = tableFromCsv(
      'Peak Rescue Visa ending 4417\nStatement period 09/01/2026 - 09/30/2026\n\nDate,Description,Amount\n09/03/2026,SHELL,64.20\n'
    )
    expect(table?.headers).toEqual(['Date', 'Description', 'Amount'])
    expect(table?.skippedLines).toBe(2)
    expect(table?.rows).toHaveLength(1)
  })

  it('spots a semicolon file that a comma count would have won', () => {
    expect(sniffDelimiter('Date;Description;Amount\n03.09.2026;HOTEL, CASPER;150,00\n')).toBe(';')
  })
})

describe('guessing which column is which', () => {
  it('reads the usual headers', () => {
    const map = guessColumns(['Transaction Date', 'Posted Date', 'Description', 'Card Member', 'Amount'])
    expect(map.date).toBe(0)
    expect(map.description).toBe(2)
    expect(map.cardholder).toBe(3)
    expect(map.amount).toBe(4)
  })

  it('prefers the day the money was spent to the day it posted', () => {
    // A charge posting three days later has crossed the end of a course more
    // than once, and the course is what the tagging is for.
    expect(guessColumns(['Posted Date', 'Transaction Date', 'Description', 'Amount']).date).toBe(1)
  })

  it('keeps debit and credit apart when the file splits them', () => {
    const map = guessColumns(['Date', 'Details', 'Debit', 'Credit'])
    expect(map.debit).toBe(2)
    expect(map.credit).toBe(3)
    expect(map.amount).toBeNull()
  })

  it('never puts one column in two roles', () => {
    const map = guessColumns(['Date', 'Name', 'Amount'])
    expect(map.description === map.cardholder).toBe(false)
  })
})

describe('amounts as banks write them', () => {
  it.each([
    ['$1,234.56', 1234.56],
    ['(45.00)', -45],
    ['45.00-', -45],
    ['-45.00', -45],
    ['64.20', 64.2],
  ])('reads %s', (raw, expected) => {
    expect(parseAmount(raw)).toBe(expected)
  })

  it('says nothing rather than zero for a cell with no number', () => {
    expect(parseAmount('')).toBeNull()
    expect(parseAmount('TOTAL')).toBeNull()
  })
})

describe('dates as banks write them', () => {
  it.each([
    ['2026-09-03', '2026-09-03'],
    ['9/3/2026', '2026-09-03'],
    ['09/03/26', '2026-09-03'],
    ['3-Sep-2026', '2026-09-03'],
    ['Sep 3, 2026', '2026-09-03'],
  ])('reads %s', (raw, expected) => {
    expect(parseDate(raw)).toBe(expected)
  })

  it('takes one impossible month as proof the file is day-first', () => {
    expect(detectDayFirst(['09/03/2026', '13/09/2026'])).toBe(true)
    expect(detectDayFirst(['09/13/2026'])).toBe(false)
    // No proof either way: an American company with an American card.
    expect(detectDayFirst(['09/03/2026'])).toBe(false)
  })
})

describe('the file as charges', () => {
  const table = {
    headers: ['Date', 'Description', 'Amount'],
    rows: [
      ['09/03/2026', 'SHELL OIL', '-64.20'],
      ['09/04/2026', 'HAMPTON INN', '-312.00'],
      ['09/05/2026', 'PAYMENT THANK YOU', '1500.00'],
      ['', 'TOTAL', '-376.20'],
    ],
    skippedLines: 0,
  }
  const map = { date: 0, description: 1, amount: 2, debit: null, credit: null, cardholder: null }

  it('turns money out into a positive number, whatever the file did', () => {
    const { rows } = mapRows(table, map, { flipSign: true })
    expect(rows.map((r) => r.amount)).toEqual([64.2, 312, -1500])
  })

  it('names the rows it could not read instead of losing them quietly', () => {
    const { rows, rejected } = mapRows(table, map, { flipSign: true })
    expect(rows).toHaveLength(3)
    expect(rejected).toEqual([
      { line: 4, reason: 'no date the importer could read', raw: { Date: '', Description: 'TOTAL', Amount: '-376.20' } },
    ])
  })

  it('suggests the flip from which way the money mostly runs', () => {
    expect(suggestFlipSign([-64.2, -312, 1500])).toBe(true)
    expect(suggestFlipSign([64.2, 312, -1500])).toBe(false)
  })

  it('reads a split debit and credit file without a sign to flip', () => {
    const split = {
      headers: ['Date', 'Details', 'Debit', 'Credit'],
      rows: [
        ['09/03/2026', 'SHELL OIL', '64.20', ''],
        ['09/05/2026', 'REFUND', '', '20.00'],
      ],
      skippedLines: 0,
    }
    const { rows } = mapRows(split, { date: 0, description: 1, amount: null, debit: 2, credit: 3, cardholder: null })
    expect(rows.map((r) => r.amount)).toEqual([64.2, -20])
  })

  it('keeps the untouched row beside the parsed one', () => {
    const { rows } = mapRows(table, map, { flipSign: true })
    expect(rows[0].raw).toEqual({ Date: '09/03/2026', Description: 'SHELL OIL', Amount: '-64.20' })
  })
})

describe('the same statement, imported twice', () => {
  const rows = [
    { posted_date: '2026-09-03', description: 'SHELL OIL', amount: 64.2, cardholder: 'NADAV OAKES', raw: {} },
    { posted_date: '2026-09-03', description: 'STARBUCKS', amount: 4.15, cardholder: 'NADAV OAKES', raw: {} },
    { posted_date: '2026-09-03', description: 'STARBUCKS', amount: 4.15, cardholder: 'NADAV OAKES', raw: {} },
  ]

  it('gives the same charge the same fingerprint every time', () => {
    expect(withFingerprints(rows).map((r) => r.fingerprint)).toEqual(
      withFingerprints(rows).map((r) => r.fingerprint)
    )
  })

  it('keeps two identical coffees as two charges', () => {
    const [, second, third] = withFingerprints(rows)
    expect(second.fingerprint).not.toBe(third.fingerprint)
  })

  it('does not care how the description was spaced or cased', () => {
    const [a] = withFingerprints([rows[0]])
    const [b] = withFingerprints([{ ...rows[0], description: 'Shell   Oil' }])
    expect(a.fingerprint).toBe(b.fingerprint)
  })
})
