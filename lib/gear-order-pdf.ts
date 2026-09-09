// The sheet purchasing works from. A rendering of the order as it stands right
// now — not the record. The client rings back, the numbers change, you print it
// again.

import { CONTENT_W, FAINT, INK, MARGIN, MUTED, PdfBuilder, RED } from '@/lib/pdf-layout'
import { type GearOrderLine } from '@/lib/gear-orders'
import { GEAR_CATEGORIES } from '@/lib/gear'

export type GearOrderPdf = {
  courseTitle: string
  courseSubtitle: string | null
  esQuoteNumber: string | null
  respondedName: string | null
  respondedAt: string | null
  clientNote: string | null
  lines: GearOrderLine[]
}

const QTY_W = 46

export async function generateGearOrderPdf(data: GearOrderPdf): Promise<Uint8Array> {
  const b = await PdfBuilder.create({
    title: data.courseTitle,
    subtitle: data.courseSubtitle,
    kind: data.esQuoteNumber ? `Gear order ${data.esQuoteNumber}` : 'Gear order',
  })

  // Who said so and when. Without it this is an anonymous list of numbers, and
  // purchasing has no one to go back to.
  const provenance = data.respondedName
    ? `Confirmed by ${data.respondedName}${data.respondedAt ? ` on ${new Date(data.respondedAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' })}` : ''}.`
    : 'Not yet confirmed by the client — these are our proposed quantities.'
  b.paragraph(provenance, { size: 9.5, color: data.respondedName ? MUTED : RED })
  b.y -= 10

  if (data.clientNote) {
    b.sectionHeading('From the client')
    b.paragraph(data.clientNote, { size: 9.5, color: MUTED, paragraphs: true })
    b.y -= 10
  }

  const wanted = data.lines.filter((l) => !l.removed && Number(l.qty_wanted ?? 0) > 0)
  const dropped = data.lines.filter((l) => l.removed || !(Number(l.qty_wanted ?? 0) > 0))

  b.sectionHeading('To order')
  if (wanted.length === 0) {
    b.paragraph('Nothing requested.', { size: 10, color: MUTED })
  }

  // Grouped, not just watched for changes as we go. The lines arrive in the
  // gear list's own order, which returns to a category as often as the list
  // does — checking whether the category changed since the last row prints
  // "DESCENT AND BELAY" four times. Purchasing buys by category; each one
  // appears once, in catalog order, with the list's order kept inside it.
  const byCategory = new Map<string, GearOrderLine[]>()
  for (const l of wanted) {
    const cat = l.category ?? 'Other'
    byCategory.set(cat, [...(byCategory.get(cat) ?? []), l])
  }
  const order = [...GEAR_CATEGORIES, 'Other'] as readonly string[]
  const rank = (cat: string) => order.indexOf(cat) + 1 || 99
  const groups = [...byCategory.entries()].sort(([x], [y]) => rank(x) - rank(y))

  for (const [cat, items] of groups) {
    // A category that spills over says so again at the top of the next page:
    // a column of quantities under nothing is the one thing a break destroys.
    const heading = (suffix = '') => {
      b.text((cat + suffix).toUpperCase(), { size: 7.5, color: FAINT })
      b.y -= 13
    }
    b.ensure(30)
    b.y -= 4
    heading()
    b.continued = () => heading(' (continued)')

    for (const l of items) {
      const body = `${l.name}${l.detail ? ` — ${l.detail}` : ''}`
      const width = CONTENT_W - QTY_W
      // The notes are part of the row: reserved with it, so a page never
      // breaks between an item and what the client said about it.
      const notes = [l.client_note && `Client: ${l.client_note}`, l.admin_note].filter(Boolean) as string[]
      b.ensure(
        b.measure(body, { width, size: 9.5, leading: 12.5 }) +
          notes.reduce((h, n) => h + b.measure(n, { width, size: 8.5, leading: 11 }), 0) +
          6
      )
      b.text(String(l.qty_wanted), { x: MARGIN, size: 10, bold: true, color: INK })
      b.paragraph(body, { x: MARGIN + QTY_W, width, size: 9.5, leading: 12.5 })
      for (const n of notes) {
        b.paragraph(n, { x: MARGIN + QTY_W, width, size: 8.5, leading: 11, color: MUTED })
      }
      b.y -= 4
    }
    b.continued = null
  }

  // Kept, because "they didn't want these" is an answer purchasing benefits
  // from seeing — it stops the same items being queried back up the chain.
  if (dropped.length > 0) {
    b.y -= 8
    b.sectionHeading('Not wanted')
    for (const l of dropped) {
      b.ensure(13)
      b.paragraph(`${l.name}${l.client_note ? ` — “${l.client_note}”` : ''}`, {
        x: MARGIN + 10, width: CONTENT_W - 10, size: 8.5, leading: 11.5, color: MUTED,
      })
    }
  }

  b.ensure(24)
  b.y -= 2
  b.hairline()
  b.y -= 12
  b.text(
    `Printed ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })} — the portal has the current order.`,
    { size: 7.5, color: FAINT }
  )

  return b.save()
}
