'use client'

import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'

// Rejects after `ms` so a hung request surfaces as "Save failed" instead of
// spinning forever. The underlying request may still land later — saves are
// idempotent, so a retry after a late success is harmless.
export function withSaveTimeout<T>(promise: Promise<T>, ms = 10_000): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Save timed out')), ms)
    promise.then(
      (v) => {
        clearTimeout(timer)
        resolve(v)
      },
      (e) => {
        clearTimeout(timer)
        reject(e)
      }
    )
  })
}

// Blocks leaving the page while an auto-save hasn't landed. Tab close and
// reload get the browser's native "unsaved changes" dialog; clicks on in-app
// links get a confirm — cancelling keeps the user here and calls `onBlocked`
// so the caller can scroll to and highlight the unsaved field.
// `onLeaveAttempt` fires on any leave attempt, before the dialog, so callers
// can flush a pending save immediately. Browser back/forward is not guarded.
export function useUnsavedGuard({
  dirty,
  message,
  onBlocked,
  onLeaveAttempt,
}: {
  dirty: boolean
  message: string
  onBlocked?: () => void
  onLeaveAttempt?: () => void
}) {
  const router = useRouter()
  const cb = useRef({ message, onBlocked, onLeaveAttempt })
  useEffect(() => {
    cb.current = { message, onBlocked, onLeaveAttempt }
  })

  useEffect(() => {
    if (!dirty) return

    const beforeUnload = (e: BeforeUnloadEvent) => {
      cb.current.onLeaveAttempt?.()
      e.preventDefault()
      e.returnValue = ''
    }

    const onClick = (e: MouseEvent) => {
      // Only plain left-clicks navigate this tab; modified clicks open a new
      // one and leave this page (and its state) alone.
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
      const a = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null
      if (!a || a.target === '_blank' || a.hasAttribute('download')) return
      const href = a.getAttribute('href') ?? ''
      // Hash links stay on the page; cross-origin links do a full page load,
      // which the beforeunload dialog already covers.
      if (href.startsWith('#') || a.origin !== window.location.origin) return

      // preventDefault makes next/link skip its router.push; stopImmediate
      // keeps sibling guards from stacking a second confirm on one click.
      e.preventDefault()
      e.stopImmediatePropagation()
      cb.current.onLeaveAttempt?.()
      if (window.confirm(cb.current.message)) {
        router.push(a.pathname + a.search + a.hash)
      } else {
        cb.current.onBlocked?.()
      }
    }

    window.addEventListener('beforeunload', beforeUnload)
    document.addEventListener('click', onClick, true)
    return () => {
      window.removeEventListener('beforeunload', beforeUnload)
      document.removeEventListener('click', onClick, true)
    }
  }, [dirty, router])
}
