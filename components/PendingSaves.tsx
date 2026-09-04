'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useRef } from 'react'

// Who still owes the server something, so that closing an editor can wait for
// it instead of dropping it.
//
// The auto-saving fields in these editors save on a debounce: for the second
// after you stop typing there is a change on screen that is not yet anywhere
// else. Closing the editor unmounts the form, the timer fires into nothing,
// and the edit is gone — silently, because everything looked saved. The X is
// the one control people press *because* they are done, so it is exactly the
// wrong moment to lose the last thing they typed.
//
// A saver registers here and answers two questions: is anything outstanding,
// and send it now. The editor's close button settles them all before it goes.
export type Saver = {
  /** Is there an edit that hasn't landed — debounced, in flight, or failed. */
  isPending: () => boolean
  /** Send whatever is outstanding, now, and resolve when it has landed. */
  flush: () => Promise<void>
}

const PendingSavesContext = createContext<{ register: (s: Saver) => () => void } | null>(null)

/** Held by whatever owns the way out — see EditInPlace. `settle` returns false
    if something is still unsaved after being asked to flush, which is a save
    that is failing rather than one that is merely slow. */
export function usePendingSaves() {
  const savers = useRef(new Set<Saver>())

  const register = useCallback((s: Saver) => {
    savers.current.add(s)
    return () => {
      savers.current.delete(s)
    }
  }, [])

  const anyPending = useCallback(() => [...savers.current].some((s) => s.isPending()), [])

  const settle = useCallback(async () => {
    // A flush can leave more work behind it — a form that queues a re-run
    // because a save was already in the air — so ask again until it is quiet.
    // Bounded, and tightly: a save that is failing takes its full timeout
    // every time it is asked, so a third round is another ten seconds of a
    // person waiting to find out it still didn't work. Two, then the caller
    // asks them what they want to do about it.
    for (let round = 0; round < 2; round++) {
      const busy = [...savers.current].filter((s) => s.isPending())
      if (busy.length === 0) return true
      await Promise.all(busy.map((s) => s.flush().catch(() => {})))
    }
    return !anyPending()
  }, [anyPending])

  const value = useMemo(() => ({ register }), [register])
  return { value, settle, anyPending, Provider: PendingSavesContext.Provider }
}

/** Registered by an auto-saving field or form. A no-op where nothing is
    listening, so the same component still works outside an editor. */
export function useRegisterSaver(saver: Saver) {
  const ctx = useContext(PendingSavesContext)
  // The callbacks close over state that changes on every keystroke; the entry
  // in the set must not, or it would re-register constantly and a flush could
  // race the swap. One stable object, reading the latest callbacks.
  const latest = useRef(saver)
  useEffect(() => {
    latest.current = saver
  })
  const entry = useRef<Saver>({
    isPending: () => latest.current.isPending(),
    flush: () => latest.current.flush(),
  })
  const register = ctx?.register
  useEffect(() => {
    if (!register) return
    return register(entry.current)
  }, [register])
}

/** For fields that save on blur rather than on a timer. There is nothing to
    flush — the request went out the moment focus left, which on the way to the
    X is the mousedown before the click — but the close that follows still has
    to wait for it, or the page re-reads itself while the save is in the air and
    redraws the value that was just replaced.

    Wrap the promise: `await track(updateThing(...))`. */
export function useTrackedSaves() {
  const inFlight = useRef(new Set<Promise<unknown>>())
  useRegisterSaver({
    isPending: () => inFlight.current.size > 0,
    flush: async () => {
      await Promise.allSettled([...inFlight.current])
    },
  })
  return useCallback(<T,>(p: Promise<T>): Promise<T> => {
    inFlight.current.add(p)
    const done = () => inFlight.current.delete(p)
    p.then(done, done)
    return p
  }, [])
}
