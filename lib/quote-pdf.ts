// The quote as a page — what a client's purchasing office files, attaches to a
// PO request, or forwards to whoever signs. The web page is still the quote;
// this is its paper copy, in the same document family as the gear list and
// the actuals so everything we hand a client looks like it came from one place.
//
// Drawn from the same row the page reads, at the moment it is asked for: a
// quote accepted since it was first downloaded says so when downloaded again.

import { CONTENT_W, FAINT, INK, MARGIN, MUTED, PdfBuilder, RED } from '@/lib/pdf-layout'
import { fmtMoney } from '@/lib/expenses'
import { longDate } from '@/lib/course-clock'
import { QUOTE_CONTACT, QUOTE_MISSION, type QuoteOption } from '@/lib/quotes'

export type QuotePdf = {
  quoteNumber: string
  courseName: string
  clientName: string | null
  /** Dates and location, already formatted — the line under the title. */
  subtitle: string | null
  status: string
  total: number
  options: QuoteOption[] | null
  scopeBullets: string[]
  blurb: string | null
  validUntil: string | null
  acceptedName: string | null
  acceptedAt: string | null
  /** Paid in full by card, when it was. A copy filed for accounting that
      doesn't say it was paid is a copy that gets paid twice. */
  paid: { amount: number; on: string | null } | null
  preparedBy: { name: string; email: string | null } | null
  commitment: string
  /** yyyy-mm-dd on the office clock, for deciding whether it has expired. */
  today: string
}

export async function generateQuotePdf(data: QuotePdf): Promise<Uint8Array> {
  const b = await PdfBuilder.create({
    title: data.courseName,
    subtitle: [data.quoteNumber, data.subtitle].filter(Boolean).join('  ·  '),
    kind: 'Training quote',
    logo: true,
  })

  b.paragraph(`Prepared for ${data.clientName ?? 'your team'}`, { size: 11, bold: true })
  b.y -= 2

  // Where the quote stands, so a printed copy can't be mistaken for an offer
  // still open after it was accepted, or for one still open after it lapsed.
  const accepted = data.status === 'accepted'
  const expired = data.status === 'sent' && data.validUntil !== null && data.validUntil < data.today
  const standing = accepted
    ? `Accepted${data.acceptedName ? ` by ${data.acceptedName}` : ''}${data.acceptedAt ? ` on ${longDate(data.acceptedAt.slice(0, 10))}` : ''}.`
    : data.status === 'declined'
      ? 'Declined.'
      : data.status === 'draft'
        ? 'Draft. This quote has not been sent.'
        : expired
          ? `Expired ${longDate(data.validUntil!)}. Contact us for an updated quote.`
          : data.validUntil
            ? `Valid through ${longDate(data.validUntil)}.`
            : null
  if (standing) b.paragraph(standing, { size: 9.5, color: expired || data.status === 'draft' ? RED : MUTED })
  if (data.paid) {
    b.paragraph(
      `Paid in full by card${data.paid.on ? ` on ${longDate(data.paid.on)}` : ''}: ${fmtMoney(data.paid.amount)}.`,
      { size: 9.5, color: MUTED }
    )
  }
  b.y -= 14

  // ── Overview ───────────────────────────────────────────────────────────────

  if (data.blurb?.trim()) {
    b.sectionHeading('Overview')
    b.paragraph(data.blurb.trim(), { size: 10, paragraphs: true })
    b.y -= 14
  }

  // ── Price ──────────────────────────────────────────────────────────────────

  // Label left, amount right in its column — the actuals' ledger line.
  const line = (
    label: string,
    amount: number,
    opts?: { bold?: boolean; size?: number; indent?: number; color?: typeof INK; note?: string }
  ) => {
    const size = opts?.size ?? 10.5
    const noteSize = size - 2
    b.ensure(size * 1.6 + (opts?.note ? noteSize * 1.4 : 0))
    const x = MARGIN + (opts?.indent ?? 0)
    const font = opts?.bold ? b.bold : b.font
    const text = fmtMoney(amount)
    const amountW = font.widthOfTextAtSize(text, size)
    b.paragraph(label, { x, size, bold: opts?.bold, color: opts?.color, width: CONTENT_W - (opts?.indent ?? 0) - amountW - 16, leading: size * 1.35 })
    const last = b.y + size * 1.35
    b.text(text, { x: MARGIN + CONTENT_W - amountW, y: last, size, bold: opts?.bold, color: opts?.color ?? INK })
    if (opts?.note) b.paragraph(opts.note, { x, size: noteSize, color: FAINT })
    b.y -= size * 0.4
  }

  const options = data.options
  const chosen = options?.filter((o) => o.chosen) ?? []
  const isAddition = (o: QuoteOption) => o.relation === 'addition' || Boolean(o.requires)
  const addedTo = (o: QuoteOption) =>
    o.requires
      ? `Added to ${options?.find((p) => p.estimate_id === o.requires)?.title ?? 'the option above'}`
      : 'Added to whichever option you take'

  if (options && !(accepted && chosen.length > 0)) {
    b.sectionHeading('Pricing options', { keepWith: 40 })
    for (const o of options) {
      line(o.title, Number(o.total), {
        indent: isAddition(o) ? 18 : 0,
        note: isAddition(o) ? addedTo(o) : undefined,
      })
    }
    b.y -= 4
    b.paragraph(
      'The courses are alternatives: one of them. An addition is priced as the difference, taken on top of the course it adds to.',
      { size: 9, color: MUTED }
    )
  } else {
    b.sectionHeading(options ? `Accepted option${chosen.length > 1 ? 's' : ''}` : 'Price', { keepWith: 40 })
    if (options) {
      for (const o of chosen) {
        line(o.title, Number(o.total), {
          size: 10,
          indent: 10,
          color: MUTED,
          note: isAddition(o) ? addedTo(o) : undefined,
        })
      }
      b.y -= 2
      b.hairline({ x: MARGIN + CONTENT_W - 220, width: 220 })
      b.y -= 14
    }
    line('Total price', data.total, { bold: true, size: 14 })
  }

  if (data.scopeBullets.length > 0) {
    b.y -= 14
    b.sectionHeading('Included')
    for (const bullet of data.scopeBullets) {
      b.ensure(16)
      b.text('•', { x: MARGIN + 2, size: 10, color: RED })
      b.paragraph(bullet, { x: MARGIN + 16, width: CONTENT_W - 16, size: 10 })
      b.y -= 2
    }
  }
  b.y -= 14

  // ── Company and contact ────────────────────────────────────────────────────

  b.sectionHeading('Our company')
  b.paragraph(QUOTE_MISSION, { size: 9.5, color: MUTED })
  b.y -= 14

  const contact = [
    data.preparedBy?.name,
    data.preparedBy?.email,
    QUOTE_CONTACT.phone,
    QUOTE_CONTACT.website,
  ].filter((s): s is string => Boolean(s))
  b.sectionHeading('Contact us', { keepWith: contact.length * 14 })
  for (const c of contact) b.paragraph(c, { size: 9.5 })
  b.y -= 14

  // ── Commitment ─────────────────────────────────────────────────────────────

  // Kept whole with its signature: a sign-off stranded on a page of its own
  // reads as an afterthought.
  b.sectionHeading('Our commitment to you', {
    keepWith: b.measure(data.commitment, { size: 10 }) + (data.preparedBy ? 44 : 0),
  })
  b.paragraph(data.commitment, { size: 10 })
  if (data.preparedBy) {
    b.y -= 14
    b.ensure(30)
    b.paragraph(data.preparedBy.name, { size: 10, bold: true })
    b.paragraph('Peak Rescue', { size: 9, color: MUTED })
  }

  return b.save()
}
