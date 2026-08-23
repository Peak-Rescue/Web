// The signed waiver as a document you could hand to a lawyer.
//
// Rendered from the signature row and the exact version it points at, so it
// reproduces what was on screen rather than what the waiver says today. That
// is the whole reason the text is versioned: a copy produced three years from
// now has to be the words that person actually agreed to.
//
// It carries the signing record too — when, from where, and how well we knew
// who was signing. A page that shows only the marks invites the question it
// can't answer.

import { CONTENT_W, FAINT, MARGIN, MUTED, PdfBuilder } from '@/lib/pdf-layout'
import type { WaiverBody } from '@/lib/waiver'

export type WaiverPdfData = {
  courseTitle: string
  courseSubtitle: string | null
  templateName: string
  version: number | null
  body: WaiverBody

  signerRole: 'adult' | 'guardian'
  firstName: string
  middleName: string | null
  lastName: string
  phone: string | null
  dateOfBirth: string
  email: string

  guardianFirstName: string | null
  guardianMiddleName: string | null
  guardianLastName: string | null
  guardianPhone: string | null
  guardianDob: string | null

  addressLine1: string | null
  addressLine2: string | null
  city: string | null
  state: string | null
  postalCode: string | null
  country: string | null

  emergencyFirstName: string | null
  emergencyLastName: string | null
  emergencyPhone: string | null
  emergencyRelationship: string | null

  initialsImage: string | null
  signatureImage: string
  signedAt: string
  ipAddress: string | null
  identity: 'authenticated' | 'unverified'
  source: 'portal' | 'qr'
}

const BODY_SIZE = 9
const BODY_LEAD = 12.5

function pngBytes(dataUrl: string): Uint8Array | null {
  const comma = dataUrl.indexOf(',')
  if (comma < 0) return null
  try {
    return Uint8Array.from(Buffer.from(dataUrl.slice(comma + 1), 'base64'))
  } catch {
    return null
  }
}

const fullName = (first: string | null, middle: string | null, last: string | null) =>
  [first, middle, last].filter(Boolean).join(' ').trim() || '—'

/** A stored yyyy-mm-dd, shown as a date without being dragged through a timezone. */
function plainDate(value: string | null): string {
  if (!value) return '—'
  const [y, m, d] = value.split('-').map(Number)
  if (!y || !m || !d) return value
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC',
  })
}

export async function generateWaiverPdf(data: WaiverPdfData): Promise<Uint8Array> {
  const b = await PdfBuilder.create({
    title: data.courseTitle,
    subtitle: data.courseSubtitle,
    kind: data.templateName,
  })

  // ── The agreement, as it was shown ────────────────────────────────────────

  b.paragraph(data.body.title, { size: 11, bold: true })
  b.y -= 6
  b.paragraph(data.body.warning, { size: BODY_SIZE, leading: BODY_LEAD, bold: true })
  b.y -= 6
  b.paragraph(data.body.preamble, { size: BODY_SIZE, leading: BODY_LEAD })
  b.y -= 8

  for (const clause of data.body.clauses) {
    const num = `${clause.number}.`
    const numW = 16
    const x = MARGIN + numW
    const width = CONTENT_W - numW

    clause.paragraphs.forEach((p, i) => {
      // The run-in heading is part of the first sentence, so it is drawn as a
      // bold lead-in rather than a line of its own — the same way it reads on
      // screen and in the original.
      const text = i === 0 && clause.heading ? `${clause.heading}. ${p}` : p
      b.ensure(BODY_LEAD * 2)
      if (i === 0) b.text(num, { size: BODY_SIZE, bold: true })
      b.paragraph(text, { x, width, size: BODY_SIZE, leading: BODY_LEAD })
      b.y -= 3
    })

    for (const item of clause.items ?? []) {
      b.ensure(BODY_LEAD * 2)
      b.text(`${item.label}.`, { x: x + 8, size: BODY_SIZE })
      b.paragraph(item.text, { x: x + 24, width: width - 24, size: BODY_SIZE, leading: BODY_LEAD })
      b.y -= 2
    }

    for (const p of clause.trailing ?? []) {
      b.paragraph(p, { x, width, size: BODY_SIZE, leading: BODY_LEAD })
      b.y -= 3
    }

    if (data.body.initials_after_clause === clause.number && data.initialsImage) {
      await drawMark(b, data.initialsImage, 'Initialled', { width: 70, x })
    }

    b.y -= 5
  }

  // ── Who signed ────────────────────────────────────────────────────────────

  const participantLabel = data.signerRole === 'guardian' ? 'Participant (minor)' : 'Participant'
  b.sectionHeading(participantLabel)
  fields(b, [
    ['Name', fullName(data.firstName, data.middleName, data.lastName)],
    ['Date of birth', plainDate(data.dateOfBirth)],
    ['Phone', data.phone ?? '—'],
    ['Email', data.email],
  ])

  if (data.signerRole === 'guardian') {
    b.y -= 6
    b.sectionHeading('Parent or legal guardian')
    for (const line of data.body.guardian_notice) {
      b.paragraph(line, { size: 8, leading: 10.5, color: MUTED })
      b.y -= 2
    }
    b.y -= 4
    fields(b, [
      ['Name', fullName(data.guardianFirstName, data.guardianMiddleName, data.guardianLastName)],
      ['Date of birth', plainDate(data.guardianDob)],
      ['Phone', data.guardianPhone ?? '—'],
    ])
  }

  b.y -= 6
  b.sectionHeading('Emergency contact')
  fields(b, [
    ['Name', fullName(data.emergencyFirstName, null, data.emergencyLastName)],
    ['Phone', data.emergencyPhone ?? '—'],
    ['Relationship', data.emergencyRelationship ?? '—'],
  ])

  const address = [
    data.addressLine1, data.addressLine2,
    [data.city, data.state].filter(Boolean).join(', '),
    [data.postalCode, data.country].filter(Boolean).join('  '),
  ].filter((l) => l && l.trim())
  if (address.length) {
    b.y -= 6
    b.sectionHeading('Participant address')
    for (const line of address) {
      b.paragraph(line!, { size: 9, leading: 12 })
    }
  }

  // ── The signature and what stands behind it ───────────────────────────────

  b.y -= 10
  b.sectionHeading(data.signerRole === 'guardian' ? 'Guardian signature' : 'Signature', { keepWith: 90 })
  await drawMark(b, data.signatureImage, null, { width: 180 })

  b.y -= 4
  b.paragraph('Electronic signature consent — agreed', { size: 8.5, bold: true, color: MUTED })
  b.paragraph(data.body.esign_consent, { size: 7.5, leading: 10, color: FAINT })

  b.y -= 10
  b.sectionHeading('Signing record')
  fields(b, [
    ['Signed', new Date(data.signedAt).toLocaleString('en-US', {
      year: 'numeric', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit',
      timeZoneName: 'short',
    })],
    ['Document', `${data.templateName}${data.version ? ` · version ${data.version}` : ''}`],
    // Spelled out rather than left as a code word. Someone reading this years
    // from now needs to know how much the name above is worth without having
    // to find whoever wrote the software.
    ['Identity', data.identity === 'authenticated'
      ? 'Signed in to the portal as this participant'
      : 'Self-entered — signed without logging in'],
    ['Signed via', data.source === 'portal' ? 'Course portal' : 'Course QR code'],
    ['IP address', data.ipAddress ?? 'not recorded'],
  ])

  return b.save()
}

/** A label/value run — a narrow bold label with the value beside it. */
function fields(b: PdfBuilder, rows: [string, string][]) {
  const labelW = 92
  for (const [label, value] of rows) {
    const h = b.measure(value, { width: CONTENT_W - labelW, size: 9, leading: 12 })
    b.ensure(h)
    b.text(label, { size: 8, bold: true, color: MUTED })
    b.paragraph(value, { x: MARGIN + labelW, width: CONTENT_W - labelW, size: 9, leading: 12 })
    b.y -= 3
  }
}

/** A signature or set of initials, drawn at a fixed width with a rule beneath. */
async function drawMark(
  b: PdfBuilder,
  dataUrl: string,
  caption: string | null,
  { width, x = MARGIN }: { width: number; x?: number }
) {
  const bytes = pngBytes(dataUrl)
  if (!bytes) return
  let image
  try {
    image = await b.doc.embedPng(bytes)
  } catch {
    // A mark we can't decode must not cost the whole document — the row is
    // still the record, and a missing image is visible on its face.
    return
  }
  const height = (image.height / image.width) * width
  b.ensure(height + 18)
  b.y -= height
  b.page.drawImage(image, { x, y: b.y, width, height })
  b.y -= 4
  b.page.drawLine({
    start: { x, y: b.y },
    end: { x: x + width, y: b.y },
    thickness: 0.6,
    color: FAINT,
  })
  b.y -= 10
  if (caption) {
    b.text(caption, { x, size: 7.5, color: FAINT })
    b.y -= 10
  }
}
