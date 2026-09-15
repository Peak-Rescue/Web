'use client'

import { useState } from 'react'
import SaveButton from '@/components/SaveButton'
import TrashIcon from '@/components/TrashIcon'
import { updateCostAccount, retireCostAccount } from '@/app/admin/courses/actuals-actions'

// One cost category: its name, and which kinds of expense land in it.
//
// The routing is the part worth showing. Without it, "Travel expenses" on a
// course is a total with no explanation of how the money got there — and the
// first time a lodging receipt turns up under Misc, there is nowhere to look.

export type ExpenseCategoryChoice = { value: string; label: string }

export default function CostCategoryRow({
  id,
  label,
  categories,
  choices,
  claimedElsewhere,
  columns,
}: {
  id: string
  /** The table's column template, handed down so the row cannot line up to
      anything other than the header above it. */
  columns: string
  label: string
  categories: string[]
  choices: ExpenseCategoryChoice[]
  /** Which expense categories another cost category already claims, and by
      what name — so taking one shows what it is taken from rather than
      silently moving it. */
  claimedElsewhere: Record<string, string>
}) {
  const [open, setOpen] = useState(false)
  const [picked, setPicked] = useState<string[]>(categories)

  const toggle = (value: string) =>
    setPicked((p) => (p.includes(value) ? p.filter((v) => v !== value) : [...p, value]))

  return (
    <form action={updateCostAccount.bind(null, id)} className="px-4 py-3">
      <div className={columns}>
        <input
          name="label"
          required
          defaultValue={label}
          className="w-full md:w-auto md:min-w-0 bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-sm font-medium focus:outline-none focus:border-zinc-500"
        />
        {/* The count only, because the column above it says what is being
            counted. "Nothing routes here" on seven rows was a sentence
            repeated down the page to say nothing had happened yet. */}
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="md:min-w-0 text-left text-xs text-zinc-400 hover:text-white transition-colors"
        >
          {picked.length === 0 ? 'None' : `${picked.length} type${picked.length === 1 ? '' : 's'}`}
          <span className="ml-1 text-zinc-600">{open ? '▴' : '▾'}</span>
        </button>
        <SaveButton
          icon
          className="flex items-center justify-center text-zinc-500 hover:text-white transition-colors"
        />
        <button
          type="submit"
          formAction={retireCostAccount.bind(null, id)}
          title="Remove — deleted if unused, retired if costs point at it"
          aria-label={`Remove ${label}`}
          className="flex items-center justify-center text-zinc-600 hover:text-pr-red-light transition-colors"
        >
          <TrashIcon className="w-4 h-4" />
        </button>
      </div>

      {open && (
        <div className="mt-3 pl-1 flex flex-wrap gap-x-4 gap-y-1.5">
          {choices.map((c) => {
            const taken = claimedElsewhere[c.value]
            return (
              <label key={c.value} className="flex items-center gap-1.5 text-xs text-zinc-300">
                <input
                  type="checkbox"
                  name="categories"
                  value={c.value}
                  checked={picked.includes(c.value)}
                  onChange={() => toggle(c.value)}
                  className="accent-red-600"
                />
                {c.label}
                {taken && !picked.includes(c.value) && (
                  <span className="text-zinc-600">(in {taken})</span>
                )}
              </label>
            )
          })}
        </div>
      )}
    </form>
  )
}
