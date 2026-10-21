'use client'

import { useState } from 'react'
import InfoHint from '@/components/InfoHint'
import { adminSetExpenseReportTo } from './[id]/actions'

/** Where this person's expense reports are sent. Empty is the usual
    approver; an address here is for whoever cannot send theirs there —
    the approver's own reports first of all. */
export default function ExpenseReportToField({
  profileId,
  initialValue,
  defaultTo,
}: {
  profileId: string
  initialValue: string | null
  defaultTo: string
}) {
  const [value, setValue] = useState(initialValue ?? '')
  const [saved, setSaved] = useState(initialValue ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save() {
    const next = value.trim()
    if (saving || next === saved) return
    setSaving(true)
    setError(null)
    try {
      await adminSetExpenseReportTo(profileId, next === '' ? null : next)
      setSaved(next.toLowerCase())
      setValue(next.toLowerCase())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save that')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="px-4 py-3 bg-zinc-900 border border-zinc-800 rounded-lg">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-1.5">
          <p className="text-sm font-medium">Expense reports go to</p>
          <InfoHint text={`Who receives their submitted expense reports to approve. Leave empty for the usual, ${defaultTo}. They are copied on their own either way.`} />
        </div>
        <input
          type="email"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={save}
          onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
          disabled={saving}
          placeholder={defaultTo}
          className="w-72 max-w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-sm focus:outline-none focus:border-zinc-500 placeholder-zinc-600 disabled:opacity-50"
        />
      </div>
      {error && <p className="text-xs text-pr-red-light mt-2">{error}</p>}
    </div>
  )
}
