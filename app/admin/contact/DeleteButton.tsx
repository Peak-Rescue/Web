'use client'

import { deleteSubmission } from './actions'

export function DeleteButton({ id, name }: { id: string; name: string }) {
  return (
    <form
      action={deleteSubmission.bind(null, id)}
      onSubmit={(e) => {
        if (!confirm(`Delete the submission from ${name}? This can't be undone.`)) {
          e.preventDefault()
        }
      }}
    >
      <button type="submit" className="text-xs text-zinc-500 hover:text-pr-red transition-colors">
        Delete
      </button>
    </form>
  )
}
