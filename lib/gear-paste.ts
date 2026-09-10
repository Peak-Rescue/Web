// Turning a list somebody already wrote into rows.
//
// Every gear list we have started life as prose — an email, a course handout,
// a page of a standards document. Rebuilding one item at a time, answering a
// destination and a category for each line, is a twenty-minute job for a list
// that took thirty seconds to paste. So paste it.
//
// Nothing here touches the catalog. Every row comes out as free text, which is
// the point: a pasted line says "Thermal Protection appropriate for the venue
// (wetsuit or dry suit)" and no taxonomy has to be invented to hold that. What
// the catalog is for — a spec written once, a name that reaches a client's
// purchase order — is a later, deliberate pass over rows that have earned it,
// not a toll on the way in.
//
// The parse is a guess, and it says so: the caller shows what it made and
// lets it be corrected before anything is written. That is what makes these
// heuristics safe to be wrong.

export type PastedRow = {
  // A heading becomes the section the rows under it sit in — not a row of its
  // own. Kept in the same sequence so the preview reads like the paste.
  heading: boolean
  name: string
  note: string | null
  // A leading count: "4 carabiners". Null is the ordinary case — most lines
  // are one of a thing, and the side of the list already says so.
  each: number | null
  section: string | null
  groupType: 'personal' | 'group'
}

export type PastedList = {
  // A first line ending in a colon is titling what follows, not asking for it.
  intro: string | null
  rows: PastedRow[]
}

// Words that carry no capital of their own, so a heading is still recognisably
// a heading with them in it: "Standard Rescue Gear per Technician".
const MINOR = new Set(['per', 'and', 'or', 'of', 'the', 'for', 'a', 'an', 'with', 'to', 'n', '/', '&', '+'])

// " - ", " – ", " — ": what follows is about the thing, not another thing.
const SEP = /\s+[-–—]\s+/

// Team, group — the words a heading uses to say this half is the course's kit
// rather than each person's.
const GROUPISH = /\bteam\b|\bgroup\b|\bcommunal\b|\bshared\b/i

// A heading has no remark attached, no count in front, no bracket, and every
// word that could be capitalised is. That last test is what separates
// "Standard PPE" from "Swiftwater-rated helmet" — and it is also why a product
// named in title case on a line of its own ("La Sportiva Canyon Boot") reads
// as a heading until something below it proves otherwise. See the bracket rule
// in `parsePastedGear`, and the preview, which lets you say so by hand.
function looksLikeHeading(line: string): boolean {
  if (SEP.test(line)) return false
  if (/^[([]/.test(line)) return false
  if (/^\d+\s/.test(line)) return false
  if (/[([]/.test(line)) return false
  const words = line.replace(/:$/, '').split(/\s+/)
  if (words.length === 0 || words.length > 6) return false
  return words.every((w) => MINOR.has(w.toLowerCase()) || !/^[a-z]/.test(w))
}

export function parsePastedGear(text: string): PastedList {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean)
  const rows: PastedRow[] = []
  let intro: string | null = null
  let section: string | null = null
  let groupType: 'personal' | 'group' = 'personal'

  for (const [i, line] of lines.entries()) {
    if (i === 0 && /:$/.test(line) && !looksLikeHeading(line)) {
      intro = line.replace(/:$/, '').trim()
      continue
    }

    // A line that is nothing but a bracket is talking about the line above it.
    // Which also settles what that line was: headings don't get remarks, so
    // whatever it looked like, it was gear.
    const aside = line.match(/^[([](.*)[)\]]$/)
    if (aside && rows.length > 0) {
      const prev = rows[rows.length - 1]
      if (prev.heading) {
        prev.heading = false
        prev.section = section
        prev.groupType = groupType
      }
      prev.note = [prev.note, aside[1].trim()].filter(Boolean).join(' — ')
      continue
    }

    if (looksLikeHeading(line)) {
      section = line.replace(/:$/, '').trim()
      groupType = GROUPISH.test(section) ? 'group' : 'personal'
      rows.push({ heading: true, name: section, note: null, each: null, section, groupType })
      continue
    }

    let name = line
    let note: string | null = null

    const sep = name.match(SEP)
    if (sep && sep.index !== undefined) {
      note = name.slice(sep.index + sep[0].length).trim() || null
      name = name.slice(0, sep.index).trim()
    }

    // A bare leading integer is a count. "200' static rope" is not one: the
    // token carries a unit, so it is a length and belongs to the name.
    let each: number | null = null
    const counted = name.match(/^(\d{1,3})\s+(\S.*)$/)
    if (counted) {
      each = Number(counted[1])
      name = counted[2]
    }

    // A trailing bracket long enough to be a sentence is a remark; a short one
    // — "(webbing)", "(optional)" — is how the thing is named.
    const trailing = name.match(/^(.*?)\s*\(([^)]{12,})\)$/)
    if (trailing) {
      name = trailing[1].trim()
      note = [trailing[2].trim(), note].filter(Boolean).join(' — ')
    }

    if (!name) continue
    rows.push({
      heading: false,
      name: name.charAt(0).toUpperCase() + name.slice(1),
      note,
      each,
      section,
      groupType,
    })
  }

  return { intro, rows }
}

// Re-deriving what sits under what, after the preview has moved a line between
// being a heading and being gear. Cheaper and less error-prone than patching
// every row below the one that changed.
export function resettleSections(rows: PastedRow[]): PastedRow[] {
  let section: string | null = null
  let groupType: 'personal' | 'group' = 'personal'
  return rows.map((r) => {
    if (r.heading) {
      section = r.name
      groupType = GROUPISH.test(r.name) ? 'group' : 'personal'
      return { ...r, section, groupType }
    }
    return { ...r, section, groupType }
  })
}
