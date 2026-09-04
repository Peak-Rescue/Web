'use client'

import { useEffect, useRef, useState } from 'react'
import { useUnsavedGuard, withSaveTimeout } from '@/components/useUnsavedGuard'
import { useRegisterSaver } from '@/components/PendingSaves'

// Wraps server-rendered form fields and auto-saves them: any input/change
// debounces, then the bound server action is called with the form's data.
// Replaces explicit SaveButton forms to match the portal's auto-save feel.
export default function AutoSaveForm({
  action,
  className,
  debounceMs = 900,
  children,
}: {
  action: (formData: FormData) => Promise<void>
  className?: string
  debounceMs?: number
  children: React.ReactNode
}) {
  const formRef = useRef<HTMLFormElement>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const saving = useRef(false)
  const rerun = useRef(false)
  const running = useRef<Promise<void>>(Promise.resolve())
  const [status, setStatus] = useState<'idle' | 'pending' | 'saving' | 'saved' | 'error'>('idle')
  const [highlight, setHighlight] = useState(false)

  const dirty = status === 'pending' || status === 'saving' || status === 'error'

  // Leaving the page is guarded below; closing the editor this form sits in is
  // guarded here. Same unsaved second, two different ways out of it.
  const dirtyRef = useRef(dirty)
  useEffect(() => {
    dirtyRef.current = dirty
  })
  useRegisterSaver({
    isPending: () => dirtyRef.current,
    flush: () => flush(),
  })

  useUnsavedGuard({
    dirty,
    message:
      status === 'error'
        ? 'Changes on this page failed to save. Leave anyway and lose them?'
        : 'Changes on this page are still saving. Leave anyway? They may be lost.',
    onLeaveAttempt: () => {
      if (status === 'pending' || status === 'error') void flush()
    },
    onBlocked: () => {
      setHighlight(true)
      setTimeout(() => setHighlight(false), 2500)
      formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    },
  })

  function schedule() {
    setStatus('pending')
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => void flush(), debounceMs)
  }

  // Resolves when the form is quiet — including the re-run an edit made
  // mid-save leaves behind. A caller waiting on the save (the editor's close
  // button) has to be able to wait for *all* of it, not just the request that
  // happened to be in the air when it asked.
  async function flush(): Promise<void> {
    if (timer.current) {
      clearTimeout(timer.current)
      timer.current = null
    }
    if (!formRef.current) return
    if (saving.current) {
      rerun.current = true
      return running.current
    }
    saving.current = true
    running.current = (async () => {
      try {
        do {
          rerun.current = false
          if (!formRef.current) return
          setStatus('saving')
          try {
            await withSaveTimeout(action(new FormData(formRef.current)))
            setStatus('saved')
          } catch {
            setStatus('error')
          }
        } while (rerun.current)
      } finally {
        saving.current = false
      }
    })()
    return running.current
  }

  return (
    <form
      ref={formRef}
      onInput={schedule}
      onChange={schedule}
      onSubmit={(e) => {
        e.preventDefault()
        void flush()
      }}
      className={`${className ?? ''} ${highlight ? 'ring-1 ring-pr-red-light rounded' : ''}`}
    >
      {children}
      <div className="sm:col-span-2 col-span-full h-4 text-right">
        <span className={`text-xs ${status === 'error' ? 'text-pr-red-light' : status === 'saved' ? 'text-teal-400' : 'text-zinc-500'}`}>
          {status === 'saving' ? 'Saving…' : status === 'saved' ? 'Saved ✓' : status === 'error' ? 'Save failed — changes not saved' : status === 'pending' ? '…' : ''}
        </span>
        {status === 'error' && (
          <button type="button" onClick={() => void flush()} className="ml-2 text-xs text-zinc-300 underline hover:text-white">
            Retry
          </button>
        )}
      </div>
    </form>
  )
}
