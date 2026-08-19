// The gear list as a sheet you can pack from: a box to tick beside every line,
// the same sections and choices the portal shows, and nothing on the page that
// isn't gear.
//
// It renders from the same rows the portal reads and through the same
// placeChoices/gearLabel helpers, so a list that says "bring one of" on screen
// says it on paper. The two drifting apart would show up as a student packing
// from a sheet that doesn't match the course.

import { gearLabel, isChoice, placeSets, productName, type JoinerFields } from '@/lib/gear'
import { CONTENT_W, FAINT, INK, MARGIN, MUTED, PdfBuilder, RED } from '@/lib/pdf-layout'
import { rgb } from 'pdf-lib'

export type GearPdfEntry = JoinerFields & {
  id: string
  gear_item_id: string | null
  name: string | null
  note: string | null
  url: string | null
  section: string | null
  group_type: 'personal' | 'group'
  quantity: string | null
  gear_items: { name: string; brand: string | null; url: string | null } | null
  gear_entry_options: { sort_order: number; gear_items: { name: string; brand: string | null } | null }[]
}

export type GearPdf = {
  courseTitle: string
  courseSubtitle: string | null
  listName: string
  intro: string | null
  entries: GearPdfEntry[]
  // Models under a type, so a line that accepts any of them can name a few
  // rather than leave someone holding "Descent device" in a shop.
  modelsByType: Map<string, string[]>
}

const GROUP_LABEL = {
  personal: 'Each person brings',
  group: 'Group kit',
} as const

const BOX = rgb(0.62, 0.62, 0.65)
const NAME_SIZE = 10
const SUB_SIZE = 8.5
const SUB_LEAD = 11
const ROW_GAP = 7

// What one line says, resolved the way the portal resolves it.
function readEntry(e: GearPdfEntry, modelsByType: Map<string, string[]>) {
  const name = e.name ?? (e.gear_items ? productName(e.gear_items) : null) ?? 'Item'
  const { detail } = gearLabel(
    name,
    [...(e.gear_entry_options ?? [])]
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((o) => o.gear_items)
      .filter(Boolean)
      .map((g) => ({ name: productName(g!) }))
  )
  // Nothing ticked means any model of the type will do, so the sheet lists a
  // few instead of printing a category name and leaving it there.
  const anyOf = detail ? null : (e.gear_item_id ? modelsByType.get(e.gear_item_id) : null) ?? null
  const sub: string[] = []
  if (detail) sub.push(detail)
  if (e.note) sub.push(e.note)
  if (anyOf && anyOf.length > 0) {
    sub.push(`${anyOf.length === 1 ? 'such as ' : 'any of: '}${anyOf.join(' · ')}`)
  }
  return { name, sub }
}

export async function generateGearListPdf(data: GearPdf): Promise<Uint8Array> {
  const b = await PdfBuilder.create({
    title: data.courseTitle,
    subtitle: data.courseSubtitle,
    kind: data.listName || 'Gear list',
  })

  if (data.intro) {
    b.paragraph(data.intro, { size: 9.5, color: MUTED, paragraphs: true })
    b.y -= 12
  }

  // One line of gear: a box, the name, its quantity out at the right margin,
  // and whatever qualifies it underneath in grey.
  const drawEntry = (e: GearPdfEntry, indent: number) => {
    const { name, sub } = readEntry(e, data.modelsByType)
    const x = MARGIN + indent
    const qty = e.quantity ? `× ${e.quantity}` : null
    const qtyW = qty ? b.font.widthOfTextAtSize(qty, SUB_SIZE) + 10 : 0
    const textX = x + 15
    const width = CONTENT_W - indent - 15 - qtyW

    const height =
      b.measure(name, { width, size: NAME_SIZE, leading: 13, bold: true }) +
      sub.reduce((h, s) => h + b.measure(s, { width, size: SUB_SIZE, leading: SUB_LEAD }), 0) +
      ROW_GAP
    // The box and its name must not be separated, so the whole line — models,
    // note and all — is reserved before any of it is drawn.
    b.ensure(height)

    b.page.drawRectangle({
      x,
      y: b.y + 0.2,
      width: 7.5,
      height: 7.5,
      borderColor: BOX,
      borderWidth: 0.8,
    })
    if (qty) {
      b.text(qty, {
        x: MARGIN + CONTENT_W - b.font.widthOfTextAtSize(qty, SUB_SIZE),
        size: SUB_SIZE,
        color: MUTED,
      })
    }
    b.paragraph(name, { x: textX, width, size: NAME_SIZE, leading: 13, bold: true })
    for (const s of sub) {
      b.paragraph(s, { x: textX, width, size: SUB_SIZE, leading: SUB_LEAD, color: FAINT })
    }
    b.y -= ROW_GAP
  }

  for (const gt of ['personal', 'group'] as const) {
    const rows = data.entries.filter((e) => e.group_type === gt).sort((a, b2) => a.sort_order - b2.sort_order)
    if (rows.length === 0) continue

    b.sectionHeading(GROUP_LABEL[gt])
    // Everything below belongs to this side of the list until the next one, so
    // a break in the middle of it says so at the top of the next page.
    let openSection: string | null = null
    b.continued = () => {
      b.text(`${GROUP_LABEL[gt]} (continued)`.toUpperCase(), { size: 9, bold: true, color: INK })
      b.y -= 6
      b.hairline()
      b.y -= 14
      if (openSection) {
        b.text(openSection.toUpperCase(), { size: 7.5, bold: true, color: MUTED })
        b.y -= 13
      }
    }

    // The list's own headings, which are editorial — "Bring this as well" —
    // not the catalog's taxonomy. Most gear sits under none of them.
    const bySection = new Map<string | null, GearPdfEntry[]>()
    for (const r of rows) bySection.set(r.section ?? null, [...(bySection.get(r.section ?? null) ?? []), r])

    for (const [section, items] of bySection) {
      openSection = section
      if (section) {
        b.ensure(30)
        b.text(section.toUpperCase(), { size: 7.5, bold: true, color: MUTED })
        b.y -= 13
      }

      for (const placed of placeSets(items)) {
        if (placed.kind === 'item') {
          drawEntry(placed.row, 0)
          continue
        }

        // A set is marked on the sheet as a set. Someone packing from paper
        // reads a run of bullets as a run of requirements, so the claim goes
        // above it and the alternatives are indented under that claim.
        const choice = isChoice(placed)
        b.ensure(34)
        b.text((choice ? 'Bring one of' : 'Bring both').toUpperCase(), {
          size: 7.5,
          bold: true,
          color: RED,
        })
        b.y -= 13

        placed.alternatives.forEach((option, oi) => {
          if (choice) {
            b.ensure(22)
            // Preference is in the order, and a fallback says so — a second
            // choice that is acceptable rather than equal shouldn't read as an
            // even swap on a sheet someone shops from.
            b.text(oi === 0 ? 'Either' : option.ifNeeded ? 'Or, if needed' : 'Or', {
              x: MARGIN + 6,
              size: 7.5,
              color: option.ifNeeded ? FAINT : MUTED,
            })
            b.y -= 11
          }
          // The parts of one alternative go together or not at all — the rope
          // and the bag — so the word that binds them sits between them.
          option.rows.forEach((row, ri) => {
            if (ri > 0) {
              b.ensure(14)
              b.text('and', { x: MARGIN + (choice ? 20 : 6), size: 7.5, color: FAINT })
              b.y -= 11
            }
            drawEntry(row, choice ? 18 : 6)
          })
        })
        b.y -= 3
      }
      b.y -= 4
    }
    b.continued = null
    b.y -= 8
  }

  if (data.entries.length === 0) {
    b.paragraph('No gear has been added to this list yet.', { size: 10, color: MUTED })
  }

  // A sheet people pack from gets marked up, so it says when it was printed.
  b.ensure(24)
  b.y -= 4
  b.hairline()
  b.y -= 12
  b.text(
    `Printed ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })} — check the course portal for the current list.`,
    { size: 7.5, color: FAINT }
  )

  return b.save()
}
