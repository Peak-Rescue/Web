import { describe, it, expect } from 'vitest'
import { writeFileSync } from 'node:fs'
import { PDFDocument } from 'pdf-lib'
import { generateQuotePdf, type QuotePdf } from '@/lib/quote-pdf'
import { quoteCommitment } from '@/lib/quotes'

// Like the actuals smoke test: the drawing code measures, wraps and breaks
// pages, none of which typecheck. An unmappable character in a blurb or a
// label longer than its column is found here rather than by a client.

function quote(over: Partial<QuotePdf> = {}): QuotePdf {
  return {
    quoteNumber: 'PR-0142-Q2',
    courseName: 'Rope Rescue Technician — NFPA 1006',
    clientName: 'Natrona County SAR',
    subtitle: 'June 2, 2026 – June 6, 2026  ·  Casper, WY',
    status: 'sent',
    total: 18450,
    options: null,
    scopeBullets: [
      'Five days of instruction, 40 contact hours',
      'Three instructors at a 1:6 ratio, with all technical gear provided — ropes, hardware, litters and highlines 🧗',
    ],
    blurb: 'A five-day course in technical rope rescue.\n\nStudents leave able to build, operate and inspect mechanical-advantage systems.',
    validUntil: '2026-07-01',
    acceptedName: null,
    acceptedAt: null,
    paid: null,
    preparedBy: { name: 'Nadav Oakes', email: 'nadav@peak-rescue.com' },
    commitment: quoteCommitment('sar'),
    today: '2026-06-01',
    ...over,
  }
}

const OPTIONS = [
  { estimate_id: 'a', title: 'Drive team', total: 18450, relation: 'standalone' as const },
  { estimate_id: 'b', title: 'Fly-in team with a much longer title that has to wrap before the amount column', total: 23100, relation: 'standalone' as const },
  { estimate_id: 'c', title: 'Sixth day: swiftwater', total: 3900, relation: 'addition' as const, requires: 'a' },
]

describe('quote PDF', () => {
  it('renders a single-price quote', async () => {
    const bytes = await generateQuotePdf(quote())
    const doc = await PDFDocument.load(bytes)
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(1)
    if (process.env.QUOTE_PDF_OUT) writeFileSync(process.env.QUOTE_PDF_OUT, bytes)
  })

  it('renders open options, and accepted options with their total', async () => {
    const open = await generateQuotePdf(quote({ options: OPTIONS, total: 0 }))
    if (process.env.QUOTE_PDF_OUT) writeFileSync(process.env.QUOTE_PDF_OUT.replace('.pdf', '-open.pdf'), open)
    const bytes = await generateQuotePdf(
      quote({
        status: 'accepted',
        options: OPTIONS.map((o) => ({ ...o, chosen: o.estimate_id !== 'b' })),
        total: 22350,
        acceptedName: 'Dana Whitfield',
        acceptedAt: '2026-06-10T15:00:00Z',
        paid: { amount: 22350, on: '2026-06-11' },
      })
    )
    if (process.env.QUOTE_PDF_OUT) writeFileSync(process.env.QUOTE_PDF_OUT.replace('.pdf', '-options.pdf'), bytes)
  })

  it('survives a draft with nothing optional filled in', async () => {
    await generateQuotePdf(
      quote({ status: 'draft', blurb: null, scopeBullets: [], validUntil: null, preparedBy: null, clientName: null, subtitle: null })
    )
  })
})
