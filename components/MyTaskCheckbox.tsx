'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { setTaskStatus } from '@/app/admin/courses/task-actions'

// One-click "done" for a task on the portal home page.
export default function MyTaskCheckbox({ instanceId, taskId }: { instanceId: string; taskId: string }) {
  const [isPending, startTransition] = useTransition()
  const [checked, setChecked] = useState(false)
  const router = useRouter()

  return (
    <input
      type="checkbox"
      checked={checked}
      disabled={isPending}
      onChange={() => {
        setChecked(true)
        startTransition(async () => {
          try {
            await setTaskStatus(instanceId, taskId, true)
            router.refresh()
          } catch {
            setChecked(false)
          }
        })
      }}
      className="accent-teal-600 size-4 shrink-0 disabled:opacity-40"
    />
  )
}
