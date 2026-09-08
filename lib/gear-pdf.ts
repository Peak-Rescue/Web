// The gear list as a sheet you can pack from: a box to tick beside every line,
// the same sections and choices the portal shows, and nothing on the page that
// isn't gear.
//
// It renders from the same rows the portal reads and through the same
// placeChoices/gearLabel helpers, so a list that says "bring one of" on screen
// says it on paper. The two drifting apart would show up as a student packing
// from a sheet that doesn't match the course.

import {
  gearLabel, gearQuantity, isChoice, KIT_LABEL, placeSets, productName,
  type JoinerFields, type QuantityFields, type QuantityView,
} from '@/lib/gear'
import { CONTENT_W, FAINT, INK, MARGIN, MUTED, PdfBuilder, RED } from '@/lib/pdf-layout'
import { rgb } from 'pdf-lib'

export type GearPdfEntry = JoinerFields & QuantityFields & {
  id: string
  gear_item_id: string | null
  name: string | null
  note: string | null
  url: string | null
  section: string | null
  group_type: 'personal' | 'group'
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
  // Who is packing from this sheet. 'course' is the POC's: every quantity is
  // what the whole course needs, to buy or pull from storage. 'person' is the
  // student's: what one of them puts in a bag. Same list, same rows — the
  // difference is only ever the number, and printing the wrong one is either a
  // student buying twelve harnesses or a POC turning up with one.
  view: QuantityView
  students: number | null
}

// The two number columns, in points, matching what the editor and the portal
// draw: the rule it counts by, then what that comes to. A pair of alternatives
// laid out side by side gets columns too narrow to hold both, so below this the
// two fold back into one string — half a column is worse than a sentence.
const RULE_W = 74
const NUM_W = 30
const COL_GAP = 8
const MIN_COL_FOR_COLUMNS = 250

const BOX = rgb(0.62, 0.62, 0.65)
const NAME_SIZE = 10
const SUB_SIZE = 8.5
const SUB_LEAD = 11
const ROW_GAP = 7

// What one line says, resolved the way the portal resolves it.
function readEntry(e: GearPdfEntry) {
  const name = e.name ?? (e.gear_items ? productName(e.gear_items) : null) ?? 'Item'
  const { detail } = gearLabel(
    name,
    [...(e.gear_entry_options ?? [])]
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((o) => o.gear_items)
      .filter(Boolean)
      .map((g) => ({ name: productName(g!) }))
  )
  // Only the models someone put on this row. Listing the rest of the catalog
  // when none were ticked printed examples nobody chose — every model we happen
  // to hold under "helmet", presented on a sheet people shop from as if we had
  // recommended them. A line that names a type and nothing else is saying any
  // one of them will do, which is the whole point of naming the type.
  const sub: string[] = []
  if (detail) sub.push(detail)
  if (e.note) sub.push(e.note)
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

  // A purchasing sheet has to say what it was worked out from, or the numbers
  // on it are just numbers — and the roster it was printed against is the one
  // thing that can change under it.
  if (data.view === 'course' && data.students) {
    b.paragraph(`Quantities are for ${data.students} students.`, { size: 9, color: MUTED })
    b.y -= 10
  }

  // One line of gear: a box, the name, its quantity at the right of whatever
  // column it is in, and whatever qualifies it underneath in grey.
  //
  // Written against a column rather than the page, because the parts of one
  // alternative belong side by side — the wetsuit and the rain jacket read as
  // one thing to bring, not as two consecutive requirements. That is how the
  // editor and the portal draw them, and a sheet that stacks what the screen
  // pairs is a third dialect of the same list.
  const entryBox = (e: GearPdfEntry, x: number, width: number) => {
    const { name, sub } = readEntry(e)
    const q = gearQuantity(e, { students: data.students, view: data.view })
    // Staff get both numbers, the way the editor and the portal now show them:
    // the total for this roster, and the rule it came from. One without the
    // other is half the answer — "× 3" does not say whether the next course
    // needs three, and "1 per 4" does not say what to put in the van today.
    //
    // No number and a rule means there is no roster to count against — a
    // template on the shelf — and then the rule is what the row actually
    // knows, which is more use on paper than a blank.
    // Two cells where there is room for two, so the sheet reads down its
    // numbers the way the screen does. Narrow columns fold them back together.
    const columns = data.view === 'course' && width >= MIN_COL_FOR_COLUMNS
    const rule = data.view === 'course' ? q.rule : null
    const total = q.text ? `× ${q.text}` : null
    // Lowercase either way: "× 10 One each" beside a column reading "one each"
    // is the same fact written two ways on one sheet.
    const qty = columns ? null : [total, rule?.toLowerCase()].filter(Boolean).join('   ') || null
    const qtyW = columns
      ? RULE_W + COL_GAP + NUM_W + 10
      : qty ? b.font.widthOfTextAtSize(qty, SUB_SIZE) + 10 : 0
    const textX = x + 15
    const textW = width - 15 - qtyW
    return { name, sub, qty, rule, total, columns, textX, textW, x, width }
  }

  type EntryBox = ReturnType<typeof entryBox>

  const boxHeight = (box: EntryBox) =>
    b.measure(box.name, { width: box.textW, size: NAME_SIZE, leading: 13, bold: true }) +
    box.sub.reduce((h, t) => h + b.measure(t, { width: box.textW, size: SUB_SIZE, leading: SUB_LEAD }), 0) +
    ROW_GAP

  // Draws where it is told and reserves nothing: what has to fit was reserved
  // by whoever laid the row out, because a page break taken in the middle of a
  // pair would put the wetsuit on one page and its rain jacket on the next.
  const drawBox = (box: EntryBox) => {
    b.page.drawRectangle({
      x: box.x,
      y: b.y + 0.2,
      width: 7.5,
      height: 7.5,
      borderColor: BOX,
      borderWidth: 0.8,
    })
    if (box.columns) {
      const numX = box.x + box.width
      if (box.rule) {
        b.text(box.rule.toLowerCase(), {
          x: numX - NUM_W - COL_GAP - b.font.widthOfTextAtSize(box.rule.toLowerCase(), SUB_SIZE),
          size: SUB_SIZE,
          color: FAINT,
        })
      }
      if (box.total) {
        // The one number the sheet is carried for, so it is the one in ink.
        b.text(box.total, {
          x: numX - b.font.widthOfTextAtSize(box.total, SUB_SIZE),
          size: SUB_SIZE,
          bold: true,
          color: INK,
        })
      }
    } else if (box.qty) {
      b.text(box.qty, {
        x: box.x + box.width - b.font.widthOfTextAtSize(box.qty, SUB_SIZE),
        size: SUB_SIZE,
        color: MUTED,
      })
    }
    b.paragraph(box.name, { x: box.textX, width: box.textW, size: NAME_SIZE, leading: 13, bold: true })
    for (const t of box.sub) {
      b.paragraph(t, { x: box.textX, width: box.textW, size: SUB_SIZE, leading: SUB_LEAD, color: FAINT })
    }
    b.y -= ROW_GAP
  }

  const drawEntry = (e: GearPdfEntry, indent: number) => {
    const box = entryBox(e, MARGIN + indent, CONTENT_W - indent)
    b.ensure(boxHeight(box))
    drawBox(box)
  }

  // The parts of one alternative, side by side with the word that binds them in
  // the space they share. Columns need room to stay readable, so past two or
  // three of them — or when the page is already indented — the pair stacks
  // instead and the word goes above, which is the arrangement this used to have
  // everywhere.
  // Wide enough that the left column's quantity and the word between the
  // columns cannot be read as one thing: "× 8 and" is a sentence nobody meant.
  const AND_W = 44
  const MIN_COL = 150
  const drawAlternative = (rows: GearPdfEntry[], indent: number) => {
    const avail = CONTENT_W - indent
    const colW = (avail - AND_W * (rows.length - 1)) / rows.length

    if (rows.length === 1 || colW < MIN_COL) {
      rows.forEach((row, ri) => {
        if (ri > 0) {
          b.ensure(14)
          b.text('and', { x: MARGIN + indent, size: 7.5, color: FAINT })
          b.y -= 11
        }
        drawEntry(row, indent)
      })
      return
    }

    const boxes = rows.map((row, ri) => entryBox(row, MARGIN + indent + ri * (colW + AND_W), colW))
    const height = Math.max(...boxes.map(boxHeight))
    // Reserved as one thing: the pair goes on one page or moves to the next
    // together.
    b.ensure(height)

    const top = b.y
    boxes.forEach((box, ri) => {
      if (ri > 0) {
        // Centred in the gutter it owns, so it reads as belonging to the space
        // between the two rather than to either of them.
        b.y = top - 2
        const w = b.font.widthOfTextAtSize('and', 7.5)
        b.text('and', { x: box.x - AND_W / 2 - w / 2, size: 7.5, color: FAINT })
      }
      b.y = top
      drawBox(box)
    })
    b.y = top - height
  }

  for (const gt of ['personal', 'group'] as const) {
    const rows = data.entries.filter((e) => e.group_type === gt).sort((a, b2) => a.sort_order - b2.sort_order)
    if (rows.length === 0) continue

    b.sectionHeading(KIT_LABEL[gt])

    // What the two columns on the right are, named once at the top of them —
    // the same words the editor and the portal head them with. Without it the
    // sheet has two unlabelled numbers per row and the reader has to work out
    // which is the rule and which is the count.
    const columnHeads = () => {
      if (data.view !== 'course') return
      b.text('ITEM', { size: 6.5, bold: true, color: FAINT })
      const right = MARGIN + CONTENT_W
      b.text('RULE', {
        x: right - NUM_W - COL_GAP - b.font.widthOfTextAtSize('RULE', 6.5),
        size: 6.5, bold: true, color: FAINT,
      })
      const forLabel = data.students ? `FOR ${data.students}` : 'RULE ONLY'
      b.text(forLabel, {
        x: right - b.font.widthOfTextAtSize(forLabel, 6.5),
        size: 6.5, bold: true, color: FAINT,
      })
      b.y -= 11
    }
    columnHeads()

    // Everything below belongs to this side of the list until the next one, so
    // a break in the middle of it says so at the top of the next page.
    let openSection: string | null = null
    b.continued = () => {
      b.text(`${KIT_LABEL[gt]} (continued)`.toUpperCase(), { size: 9, bold: true, color: INK })
      b.y -= 6
      b.hairline()
      b.y -= 14
      columnHeads()
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
          // and the bag — so they sit side by side with the word that binds
          // them in the space they share, the way the screen draws them.
          drawAlternative(option.rows, choice ? 18 : 6)
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
