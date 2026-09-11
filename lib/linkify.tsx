import React from 'react'

// A URL someone typed into a sentence, made tappable.
//
// We built pins for this — the chip row under the meeting block — and a lead
// pastes the map link into the prose anyway, because that is where they are
// already typing at 2100 the night before. Both are trying to solve the same
// thing, and theirs is the one that survives contact with the morning. So the
// prose renders it as a link rather than the field insisting it was filled in
// wrong.
//
// Display only. Nothing here rewrites what was saved, and nothing harvests a
// pasted URL into a day's `meeting_links`: those are the day's own and get
// written back to it, deliberately kept apart from the meetup's so that
// editing a morning cannot quietly copy a meetup's pins onto one day, where
// correcting them stops reaching everyone. A URL in a sentence is also often
// sentence-shaped — "park at the pin, the gate code is at …" — and pulling it
// out into a chip strips the words that made it usable. The prose keeps it;
// the reader gets something to tap.
//
// Only http(s). Bare `ropewiki.com` catches more of what people type and also
// catches abbreviations, file names and sentence-ending "etc.au" — so the
// scheme is the signal that someone meant a link.

const URL_RE = /https?:\/\/[^\s<>"']+/g

// Trailing punctuation belongs to the sentence, not the URL: "meet at
// https://maps.app.goo.gl/x, then walk in" should not link the comma. Closing
// brackets only come along if the URL opened one — a Wikipedia path can
// legitimately end in ")".
function trimTrailing(url: string): string {
  let end = url.length
  while (end > 0) {
    const c = url[end - 1]
    if ('.,;:!?'.includes(c)) { end--; continue }
    if (c === ')' || c === ']') {
      const open = c === ')' ? '(' : '['
      const slice = url.slice(0, end)
      const opens = slice.split(open).length - 1
      const closes = slice.split(c).length - 1
      if (closes > opens) { end--; continue }
    }
    break
  }
  return url.slice(0, end)
}

export type Piece = { text: string } | { url: string }

/** The prose, cut into what to print and what to link. Pure, so the hard part
    — where a URL stops — can be tested without rendering anything. */
export function splitLinks(text: string): Piece[] {
  const pieces: Piece[] = []
  let at = 0
  for (const m of text.matchAll(URL_RE)) {
    const raw = m[0]
    const url = trimTrailing(raw)
    // Punctuation we declined to swallow goes back to the sentence.
    const start = m.index
    if (!url || !/^https?:\/\/[^/]/.test(url)) continue
    if (start > at) pieces.push({ text: text.slice(at, start) })
    pieces.push({ url })
    at = start + url.length
  }
  if (at < text.length) pieces.push({ text: text.slice(at) })
  return pieces
}

/** What the link reads as. A 200-character Google Maps URL set in a paragraph
    is three lines of noise, so a long one is cut to the host and the segment
    that says which thing it is — `google.com/maps/…` rather than `google.com`,
    because two pins that both read as the host tell you nothing apart. */
export function shortUrl(url: string): string {
  try {
    const u = new URL(url)
    const host = u.hostname.replace(/^www\./, '')
    const rest = (u.pathname === '/' ? '' : u.pathname) + u.search + u.hash
    if (!rest) return host
    const full = host + rest
    if (full.length <= 44) return full
    const seg = u.pathname.split('/').filter(Boolean)[0]
    return seg ? `${host}/${seg.length > 18 ? `${seg.slice(0, 18)}…` : seg}/…` : `${host}/…`
  } catch {
    return url
  }
}

/** Every URL in this prose, in order and without repeats — what the editor
    offers to pin. */
export function urlsIn(text: string): string[] {
  const seen = new Set<string>()
  for (const p of splitLinks(text)) if ('url' in p && !seen.has(p.url)) seen.add(p.url)
  return [...seen]
}

// Teal is an outside link everywhere else on this page — the pins, the chips —
// so it means the same thing here. `break-words` because the long ones are
// long enough to push a phone into sideways scroll.
export function Linkified({ text }: { text: string }) {
  return (
    <>
      {splitLinks(text).map((p, i) =>
        'url' in p ? (
          <a
            key={i}
            href={p.url}
            target="_blank"
            rel="noreferrer"
            title={p.url}
            className="text-teal-300 hover:text-teal-100 underline decoration-teal-500/40 underline-offset-2 break-words transition-colors"
          >
            {shortUrl(p.url)}
          </a>
        ) : (
          <React.Fragment key={i}>{p.text}</React.Fragment>
        ),
      )}
    </>
  )
}
