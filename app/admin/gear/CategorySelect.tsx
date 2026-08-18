'use client'

import { useState } from 'react'

// Sentinel for the "make one up" option. Not a category anything can be saved
// under — picking it swaps the select for a text field.
const NEW_CATEGORY = '__new__'

// Same idea one level down: name a generic item instead of picking one. The
// select that uses it is written where it stands, but the sentinel is shared so
// the two views can't drift onto different strings.
export const NEW_TYPE = '__new_type__'

// Category picker that can also invent one. Categories are free text on the
// item, so a new one needs nothing but typing it; the seed list in lib/gear is
// a starting vocabulary, not a closed set.
//
// Shared by the catalog and the list editor rather than written twice: the
// list editor is where you are standing when you notice a category is missing,
// and a picker that can only pick sent you to the other page to type one word.
export default function CategorySelect({
  value, options, onChange, className, disabled, autoFocus, onDismiss, allowEmpty = true,
}: {
  value: string | null
  options: readonly string[]
  onChange: (next: string) => void
  className: string
  disabled?: boolean
  autoFocus?: boolean
  // Opened in place of a control, it has to be able to close again without
  // choosing — clicking away is how people back out of a menu.
  onDismiss?: () => void
  // Filing something new always files it somewhere. "No category" is a state
  // the catalog can be in and has to be able to show, but not one to offer as
  // an answer on a form that is creating the item.
  allowEmpty?: boolean
}) {
  const [naming, setNaming] = useState(false)
  const [draft, setDraft] = useState('')

  if (naming) {
    const commit = () => {
      const next = draft.trim()
      setNaming(false); setDraft('')
      if (next) onChange(next)
    }
    return (
      <input
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit()
          if (e.key === 'Escape') { setNaming(false); setDraft('') }
        }}
        placeholder="New category name"
        className={className}
      />
    )
  }

  return (
    <select
      value={value ?? ''}
      disabled={disabled}
      autoFocus={autoFocus}
      onBlur={() => onDismiss?.()}
      onKeyDown={(e) => { if (e.key === 'Escape') onDismiss?.() }}
      onChange={(e) => (e.target.value === NEW_CATEGORY ? setNaming(true) : onChange(e.target.value))}
      className={className}
    >
      {allowEmpty && <option value="">— category —</option>}
      {options.map((c) => <option key={c} value={c}>{c}</option>)}
      <option value={NEW_CATEGORY}>+ New category…</option>
    </select>
  )
}
