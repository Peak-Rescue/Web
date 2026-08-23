import React from 'react'
import type { WaiverBody } from '@/lib/waiver'

// The waiver as text on a page, rendered from the stored version rather than
// written in markup. Nobody edits this file to change what the waiver says —
// that would put the words in two places and guarantee they eventually differ.
//
// Set on a light panel on purpose. The portal is dark throughout, but this is a
// legal document people are agreeing to, and it should read like the paper it
// stands in for rather than like another card in the UI.

export default function WaiverDocument({
  body,
  /** Dropped in immediately after the clause the version nominates. */
  initialsSlot,
}: {
  body: WaiverBody
  initialsSlot?: React.ReactNode
}) {
  return (
    <article className="bg-white text-zinc-900 rounded-lg px-5 py-6 sm:px-7 max-h-[28rem] overflow-y-auto text-[13px] leading-relaxed">
      <h3 className="text-base font-bold text-center mb-4">{body.title}</h3>

      <p className="font-bold mb-4">{body.warning}</p>
      <p className="mb-4">{body.preamble}</p>

      <ol className="space-y-3">
        {body.clauses.map((clause) => (
          <li key={clause.number} className="flex gap-2">
            <span className="shrink-0 font-medium tabular-nums">{clause.number}.</span>
            <div className="min-w-0">
              {clause.paragraphs.map((p, i) => (
                <p key={i} className={i > 0 ? 'mt-2' : undefined}>
                  {/* The run-in title is part of the sentence, not a heading
                      above it — that's how it reads on the signed copy. */}
                  {i === 0 && clause.heading && <strong className="mr-1">{clause.heading}.</strong>}
                  {p}
                </p>
              ))}

              {clause.items && (
                <ul className="mt-2 space-y-1.5">
                  {clause.items.map((item) => (
                    <li key={item.label} className="flex gap-2">
                      <span className="shrink-0 font-medium">{item.label}.</span>
                      <span>{item.text}</span>
                    </li>
                  ))}
                </ul>
              )}

              {clause.trailing?.map((p, i) => (
                <p key={i} className="mt-2">{p}</p>
              ))}

              {initialsSlot && body.initials_after_clause === clause.number && (
                <div className="mt-3">{initialsSlot}</div>
              )}
            </div>
          </li>
        ))}
      </ol>
    </article>
  )
}
