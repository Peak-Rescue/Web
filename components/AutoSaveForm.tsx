'use client'

import { useRef, useState } from 'react'

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
  const [status, setStatus] = useState<'idle' | 'pending' | 'saving' | 'saved' | 'error'>('idle')

  function schedule() {
    setStatus('pending')
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => void flush(), debounceMs)
  }

  async function flush() {
    if (timer.current) {
      clearTimeout(timer.current)
      timer.current = null
    }
    if (!formRef.current) return
    if (saving.current) {
      rerun.current = true
      return
    }
    saving.current = true
    setStatus('saving')
    try {
      await action(new FormData(formRef.current))
      setStatus('saved')
    } catch {
      setStatus('error')
    } finally {
      saving.current = false
      if (rerun.current) {
        rerun.current = false
        void flush()
      }
    }
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
      className={className}
    >
      {children}
      <div className="sm:col-span-2 col-span-full h-4 text-right">
        <span className={`text-xs ${status === 'error' ? 'text-pr-red-light' : status === 'saved' ? 'text-teal-400' : 'text-zinc-500'}`}>
          {status === 'saving' ? 'Saving…' : status === 'saved' ? 'Saved ✓' : status === 'error' ? 'Save failed — check your connection' : status === 'pending' ? '…' : ''}
        </span>
      </div>
    </form>
  )
}
