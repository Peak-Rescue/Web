// The sheet purchasing works from. A rendering of the order as it stands right
// now — not the record. The client rings back, the numbers change, you print it
// again.

import { CONTENT_W, FAINT, INK, MARGIN, MUTED, PdfBuilder, RED } from '@/lib/pdf-layout'
import { type GearOrderLine } from '@/lib/gear-orders'

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
    ? `Confirmed by ${data.respondedName}${data.respondedAt ? ` on ${new Date(data.respondedAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}` : ''}.`
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

  let group: string | null = null
  for (const l of wanted) {
    const cat = l.category ?? 'Other'
    if (cat !== group) {
      group = cat
      b.ensure(20)
      b.y -= 4
      b.text(cat.toUpperCase(), { size: 7.5, color: FAINT })
      b.y -= 2
    }
    const body = `${l.name}${l.detail ? ` — ${l.detail}` : ''}`
    const width = CONTENT_W - QTY_W
    b.ensure(b.measure(body, { width, size: 9.5, leading: 12.5 }) + 6)
    b.text(String(l.qty_wanted), { x: MARGIN, size: 10, bold: true, color: INK })
    b.paragraph(body, { x: MARGIN + QTY_W, width, size: 9.5, leading: 12.5 })
    if (l.client_note) {
      b.paragraph(`Client: ${l.client_note}`, { x: MARGIN + QTY_W, width, size: 8.5, leading: 11, color: MUTED })
    }
    if (l.admin_note) {
      b.paragraph(l.admin_note, { x: MARGIN + QTY_W, width, size: 8.5, leading: 11, color: MUTED })
    }
    b.y -= 4
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
