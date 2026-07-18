'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { deleteInstance } from './actions'

export default function DeleteInstanceButton({
  instanceId,
  displayName,
  enrollmentCount,
  expenseCount,
}: {
  instanceId: string
  displayName: string
  enrollmentCount: number
  expenseCount: number
}) {
  const [confirming, setConfirming] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  function handleDelete() {
    setError(null)
    startTransition(async () => {
      try {
        await deleteInstance(instanceId)
        router.push('/admin/courses')
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Something went wrong')
        setConfirming(false)
      }
    })
  }

  if (!confirming) {
    return (
      <button
        onClick={() => setConfirming(true)}
        className="px-4 py-2 rounded text-sm font-medium text-red-400 hover:text-white hover:bg-red-900/50 border border-red-900/50 hover:border-red-700 transition-colors"
      >
        Delete course
      </button>
    )
  }

  return (
    <div className="flex items-center gap-3 flex-wrap">
      <span className="text-sm text-zinc-300">
        Permanently delete <span className="font-medium text-white">{displayName}</span>?
        {enrollmentCount > 0 && ` ${enrollmentCount} enrollment${enrollmentCount === 1 ? '' : 's'} will be removed.`}
        {expenseCount > 0 && ` ${expenseCount} expense line${expenseCount === 1 ? '' : 's'} will lose their course link (the expenses themselves are kept).`}
        {' '}This cannot be undone.
      </span>
      {error && <span className="text-sm text-red-400">{error}</span>}
      <div className="flex gap-2">
        <button
          onClick={() => setConfirming(false)}
          disabled={isPending}
          className="px-3 py-1.5 rounded text-sm font-medium text-zinc-300 hover:text-white bg-zinc-800 hover:bg-zinc-700 transition-colors disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          onClick={handleDelete}
          disabled={isPending}
          className="px-3 py-1.5 rounded text-sm font-medium bg-red-700 hover:bg-red-600 text-white transition-colors disabled:opacity-50"
        >
          {isPending ? 'Deleting…' : 'Yes, delete'}
        </button>
      </div>
    </div>
  )
}
