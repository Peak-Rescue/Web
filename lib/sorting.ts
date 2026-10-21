import type { LibraryBucket } from '@/lib/library'

// A full pass over imported material, and the line between what can be sorted
// and what has to be looked at.
//
// The import filed 822 items by which Google Classroom room they were posted
// in. Some of them say what they are loudly — a YouTube link is a video, a
// SmartWaiver link is a form, something called "Logos" is paperwork — and
// those can be filed without anyone reading them. Most do not: 307 of the
// untyped ones are Drive links named "Reference", "Company Information",
// "Working Aloft". No rule should pretend to know what those are.
//
// So every item gets one of two answers, and the second is not a failure:
// filing something wrongly is worse than leaving it, because a shelf that
// looks sorted never gets checked again.

export type Verdict = {
  bucket?: LibraryBucket
  kind?: string
  adminOnly?: boolean
  /** Why, in the words that would be used out loud. Shown on the review pile. */
  reason: string
}

export type Classified =
  | ({ confident: true } & Verdict)
  | { confident: false; reason: string }

export type SortableItem = {
  title: string
  url: string | null
  kind: string
  bucket: LibraryBucket | null
  admin_only?: boolean
  source_topic: string | null
  /** True when something already points at it — a course, a setup, a section.
      Whatever it is, somebody found it where it is. */
  used?: boolean
}

const host = (url: string | null): string => {
  try { return new URL(url!).hostname.replace(/^www\./, '').toLowerCase() } catch { return '' }
}

// Phrases that name the thing outright. Ordered: the first match wins, so the
// narrow ones come before the broad.
const BY_TITLE: { re: RegExp; v: Verdict }[] = [
  {
    re: /\b(mou|memorandum of understanding|certificate of insurance|coi)\b/i,
    v: { kind: 'permit', bucket: 'documents', adminOnly: true, reason: 'an agreement or insurance certificate' },
  },
  {
    re: /\bpermits?\b/i,
    v: { kind: 'permit', bucket: 'documents', adminOnly: true, reason: 'a permit' },
  },
  {
    re: /\b(waivers?|release of liability|assumption of risk|rosters?|sign.?ups?|smartwaiver)\b/i,
    v: { kind: 'form', bucket: 'documents', reason: 'a form people fill in' },
  },
  {
    re: /\b(evac|evacuation|rescue|med|medical) plans?\b|\brisk assessments?\b/i,
    v: { kind: 'medevac', bucket: 'documents', reason: 'a plan for when it goes wrong' },
  },
  {
    re: /\b(logos?|letterhead|employee handbook|incident report|worker incident|welcome letter|instructor expectation)/i,
    v: { bucket: 'documents', reason: 'Peak paperwork' },
  },
  {
    re: /\bskill sheet/i,
    v: { kind: 'skill_sheet', bucket: 'teaching', reason: 'a skill sheet' },
  },
  {
    // Named for what it is called out loud as well as written: "AAR",
    // "after action", "debrief", "lessons learned".
    re: /\b(aar|after.?action|debriefs?|lessons learned|post.?course review)\b/i,
    v: { kind: 'debrief', bucket: 'instructor', reason: 'a debrief from a delivery' },
  },
  {
    re: /\boutlines?\b/i,
    v: { kind: 'outline', bucket: 'instructor', reason: 'a course outline' },
  },
  {
    re: /\b(technical notice|tech notice|product (notice|information|manual))\b/i,
    v: { kind: 'tech_note', bucket: 'resource', reason: "a manufacturer's notice" },
  },
  {
    re: /\bmanuals?\b/i,
    v: { kind: 'manual', bucket: 'resource', reason: 'a manual' },
  },
  {
    re: /\b(ansi|nfpa|osha \d|astm|standards?)\b/i,
    v: { kind: 'standard', bucket: 'resource', reason: 'a standard' },
  },
  {
    re: /(\.pptx?$|\bpowerpoint\b|\bppt\b|\bpresentation\b|\.key$)/i,
    v: { kind: 'presentation', reason: 'a slide deck' },
  },
]

// Where a link points is often a surer answer than what it is called.
const BY_HOST: { hosts: string[]; v: Verdict }[] = [
  { hosts: ['youtube.com', 'youtu.be', 'vimeo.com'], v: { kind: 'video', reason: 'a video' } },
  { hosts: ['photos.google.com', 'photos.app.goo.gl'], v: { kind: 'media', reason: 'a photo album' } },
  { hosts: ['waiver.smartwaiver.com', 'smartwaiver.com'], v: { kind: 'form', bucket: 'documents', reason: 'a waiver to sign' } },
]

/**
 * What to do with one item, or an admission that it is not obvious.
 *
 * Deliberately refuses in three cases that look tractable and are not:
 *
 *  - Anything already in use. Somebody put it on a course and found it again;
 *    moving it under them buys a tidier shelf at the cost of the one thing
 *    that is demonstrably working.
 *  - Map-shaped links — CalTopo, ropewiki, a dropped pin. Making them maps
 *    files them onto a shelf where every row needs a place, and they have
 *    none, so a confident move here manufactures a different backlog.
 *  - A Drive link with a generic name. "Reference", "Company Information",
 *    "Working Aloft" — 307 of these, and nothing about them is knowable from
 *    the outside.
 */
export function classify(item: SortableItem): Classified {
  const title = item.title ?? ''
  const h = host(item.url)

  // A permit is a permit wherever it sits and whoever is using it; that one
  // overrides the leave-it-alone rule, because the cost of being wrong runs
  // the other way.
  const permitish = /\b(permits?|mou|memorandum of understanding|certificate of insurance|coi)\b/i.test(title)

  if (item.used && !permitish) {
    return { confident: false, reason: 'already used on a course — left where it is' }
  }

  // Map-shaped: a confident move here just makes a map with nowhere to be.
  if (/caltopo|sartopo|ropewiki|maps\.app\.goo\.gl|google\.com\/maps/i.test(`${h} ${item.url ?? ''}`)) {
    return { confident: false, reason: 'looks like a map — needs a place before it can be one' }
  }

  for (const { hosts, v } of BY_HOST) {
    if (hosts.includes(h)) return { confident: true, ...v }
  }
  for (const { re, v } of BY_TITLE) {
    if (re.test(title)) return { confident: true, ...v }
  }

  // The Classroom room, last and only for the rooms that are unambiguous.
  const topic = (item.source_topic ?? '').replace(/\(DO NOT POST\)/i, '').trim()
  if (/peak documents|employee information|logos/i.test(topic)) {
    return { confident: true, bucket: 'documents', reason: `posted under "${topic}"` }
  }
  if (/standards topics/i.test(topic)) {
    return { confident: true, kind: 'standard', bucket: 'resource', reason: `posted under "${topic}"` }
  }
  if (/product manuals|tech notes/i.test(topic)) {
    return { confident: true, kind: 'tech_note', bucket: 'resource', reason: `posted under "${topic}"` }
  }

  return { confident: false, reason: 'nothing about it says what it is' }
}

/** What the pass would actually change about a row, dropping the parts that
    already agree — so "no change" is distinguishable from "change to what it
    already was", and the review pile is only things that moved. */
export function changesFor(item: SortableItem, v: Verdict): Partial<SortableItem> & { admin_only?: boolean } {
  const out: Partial<SortableItem> & { admin_only?: boolean } = {}
  if (v.bucket && v.bucket !== item.bucket) out.bucket = v.bucket
  if (v.kind && v.kind !== item.kind) out.kind = v.kind
  // Compared, like the other two. Reporting a change to what something
  // already is makes a finished pass look unfinished, and a second run look
  // like the first one failed.
  if (v.adminOnly && !item.admin_only) out.admin_only = true
  return out
}

/** The tag an item wears while it is waiting to be looked at. Reuses the
    topics field the way `needs-link-check` already does, so it shows up as a
    badge on the row and filters like anything else. */
export const NEEDS_SORTING = 'needs-sorting'
