'use client'

import { useActionState } from 'react'

type State = { status: 'idle' | 'success' | 'error'; message?: string }

const initial: State = { status: 'idle' }

type Props = {
  action: () => Promise<void>
  label: string
  className?: string
}

export function InviteButton({ action, label, className }: Props) {
  const [state, formAction, pending] = useActionState(
    async (_prev: State): Promise<State> => {
      try {
        await action()
        return { status: 'success' }
      } catch (e) {
        return { status: 'error', message: e instanceof Error ? e.message : 'Failed to send' }
      }
    },
    initial,
  )

  return (
    <form action={formAction} className="flex flex-col items-end gap-1">
      <button
        type="submit"
        disabled={pending || state.status === 'success'}
        className={className}
      >
        {pending ? 'Sending…' : state.status === 'success' ? 'Sent ✓' : label}
      </button>
      {state.status === 'error' && (
        <p className="text-xs text-red-400">{state.message}</p>
      )}
    </form>
  )
}
