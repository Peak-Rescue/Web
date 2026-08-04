'use client'

import { useState, useTransition } from 'react'

// Wraps a server-rendered row so removing it disappears immediately instead of
// waiting on the round trip. Deleting a course item revalidates the whole
// course page, which is a second or two of work the person doesn't need to
// watch — the row is gone either way, and a failure puts it back.
export default function RemovableRow({
  onRemove,
  label = 'Remove',
  className,
  children,
}: {
  onRemove: () => Promise<void>
  label?: string
  className?: string
  children?: React.ReactNode
}) {
  const [gone, setGone] = useState(false)
  const [error, setError] = useState(false)
  const [, startTransition] = useTransition()

  if (gone && !error) return null

  return (
    <div className={className}>
      {children}
      <button
        type="button"
        onClick={() => {
          setGone(true)
          setError(false)
          startTransition(async () => {
            try {
              await onRemove()
            } catch {
              setGone(false)
              setError(true)
            }
          })
        }}
        className="text-xs text-zinc-600 hover:text-red-400 transition-colors"
        title={error ? 'That didn’t save — try again' : undefined}
      >
        {error ? '× retry' : label}
      </button>
    </div>
  )
}
