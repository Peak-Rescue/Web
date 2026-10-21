'use client'

import { Fragment, useState } from 'react'
import { KIND_GROUPS, KIND_META, SHELF_ORDER, shelfLabel, type LibraryShelf } from '@/lib/library'

// One control for "which shelf" and "which type", because they were never two
// questions. The library had a shelf dropdown beside a type dropdown, and the
// types in the second one belong to the shelves in the first — so you could
// ask for Reference and then for Map, and get a list of nothing with no hint
// that the two had disagreed.
//
// Shaped like the tagging dropdown, for the same reason: filing and finding
// ask the same question. With one difference that changes the shape: here
// the shelf itself is an answer — "everything on Reference" is a thing you
// want — and a browser will not let anyone click an optgroup label. So the
// shelf is a row rather than a heading, in capitals, with its types indented
// under it.
//
// It writes the two parameters the rest of the page already reads rather than
// inventing a third, so every link built elsewhere keeps working.
export default function ShelfTypeSelect({
  bucket,
  kind,
  className,
  /** Types actually present, when standing somewhere that knows. Offering
      "Video" where there is no video is a dead end dressed as a choice. */
  counts,
}: {
  bucket?: string
  kind?: string
  className?: string
  counts?: Map<string, number> | null
}) {
  const [value, setValue] = useState(kind ? `k:${kind}` : bucket ? `b:${bucket}` : '')

  const kindsOf = (shelf: LibraryShelf) =>
    KIND_GROUPS.find((g) => g.label === shelfLabel(shelf))?.kinds ?? []

  return (
    <>
      <input type="hidden" name="bucket" value={value.startsWith('b:') ? value.slice(2) : ''} />
      <input type="hidden" name="kind" value={value.startsWith('k:') ? value.slice(2) : ''} />
      <select
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className={className}
      >
        {/* No optgroups. A browser will not let anyone click an optgroup
            label, so grouping this list meant a heading and then a row
            underneath that meant the heading — the same words twice, and the
            clickable one was the quieter one.
            So the heading is the row: a shelf in capitals, its types indented
            under it. One line per shelf, selectable, and it reads as a
            hierarchy without pretending to be one. */}
        <option value="">All shelves</option>
        {SHELF_ORDER.map((shelf) => {
          const kinds = kindsOf(shelf).filter((k) => !counts || counts.has(k))
          return (
            <Fragment key={shelf}>
              <option value={`b:${shelf}`}>{shelfLabel(shelf).toUpperCase()}</option>
              {kinds.map((k) => (
                <option key={k} value={`k:${k}`}>
                  {'\u00A0\u00A0\u00A0\u00A0'}
                  {KIND_META[k] || 'No type yet'}
                  {counts ? ` (${counts.get(k)})` : ''}
                </option>
              ))}
            </Fragment>
          )
        })}
      </select>
    </>
  )
}
