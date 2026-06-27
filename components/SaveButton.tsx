'use client'

import { useEffect, useRef, useState } from 'react'
import { useFormStatus } from 'react-dom'

// Serialize a form's current values so we can tell whether anything changed.
// File inputs are represented by name+size since File objects aren't comparable.
function serialize(form: HTMLFormElement): string {
  const parts: string[] = []
  for (const [key, value] of new FormData(form).entries()) {
    parts.push(`${key}=${typeof value === 'string' ? value : `file:${value.name}:${value.size}`}`)
  }
  return parts.join('&')
}

type Props = {
  children?: React.ReactNode
  className?: string
}

/**
 * Submit button for server-action forms that mirrors the Contact Info form:
 * disabled until something changes, shows "Saving…" while the action runs,
 * then "Saved ✓" briefly on success. Drop it inside any <form action={…}>.
 */
export default function SaveButton({ children = 'Save', className = '' }: Props) {
  const { pending } = useFormStatus()
  const btnRef = useRef<HTMLButtonElement>(null)
  const baseline = useRef('')
  const wasPending = useRef(false)
  const [dirty, setDirty] = useState(false)
  const [saved, setSaved] = useState(false)

  // Snapshot the form's initial state, then flag dirty on any change.
  // Programmatic updates (e.g. the photo focal-point widget) dispatch their
  // own bubbling input events, so they're caught here too.
  useEffect(() => {
    const form = btnRef.current?.form
    if (!form) return
    baseline.current = serialize(form)
    const onChange = () => setDirty(serialize(form) !== baseline.current)
    form.addEventListener('input', onChange)
    form.addEventListener('change', onChange)
    return () => {
      form.removeEventListener('input', onChange)
      form.removeEventListener('change', onChange)
    }
  }, [])

  // When a submit finishes (pending true → false), confirm and reset baseline.
  useEffect(() => {
    const justFinished = wasPending.current && !pending
    wasPending.current = pending
    if (!justFinished) return
    const form = btnRef.current?.form
    if (form) baseline.current = serialize(form)
    setDirty(false)
    setSaved(true)
    const t = setTimeout(() => setSaved(false), 2000)
    return () => clearTimeout(t)
  }, [pending])

  return (
    <button
      ref={btnRef}
      type="submit"
      disabled={pending || !dirty}
      className={`${className} disabled:opacity-50 disabled:cursor-not-allowed`}
    >
      {pending ? 'Saving…' : saved ? 'Saved ✓' : children}
    </button>
  )
}
