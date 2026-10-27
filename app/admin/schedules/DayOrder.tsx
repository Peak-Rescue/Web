'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { reorderScheduleDays } from './actions'

// The running order as it is on screen, ahead of the server.
//
// The arrows used to wait out a full save and page rebuild per press, locked
// while they did — so carrying Friday to tomorrow was four presses and four
// seconds-long waits. Now a press moves the day here at once, and the order is
// sent once the presses stop. The days are laid out in server order and placed
// with CSS `order`, so nothing the server rendered has to be rebuilt to move.
//
// What hangs off a day's position — its number, its date, a "Day 3" title that
// follows its slot — is read from here too (see DayPosition), so it agrees
// with where the day is standing rather than where it stood on load.

const WAIT_MS = 600

type Ctx = {
  position: (id: string) => number
  count: number
  move: (id: string, direction: 'up' | 'down') => void
  isPending: () => boolean
  flush: () => Promise<void>
  dates: (string | null)[]
}

const DayOrderContext = createContext<Ctx | null>(null)

export function DayOrder({
  scheduleId,
  ids,
  dates = [],
  onError,
  className,
  children,
}: {
  scheduleId: string
  /** The days' ids in the order the server has them. */
  ids: string[]
  /** What each position is called on the calendar, already formatted —
      position, not day: the date belongs to the slot. */
  dates?: (string | null)[]
  onError?: (message: string | null) => void
  className?: string
  children: ReactNode
}) {
  const [local, setLocal] = useState<string[] | null>(null)
  const order = local ?? ids

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const inFlight = useRef<Promise<void> | null>(null)
  // Bumped on every press, so a send that lands after another press doesn't
  // hand the screen back to a server order that's already out of date.
  const version = useRef(0)
  const orderRef = useRef(order)
  const idsRef = useRef(ids)
  useEffect(() => {
    orderRef.current = order
    idsRef.current = ids
  })

  const send = useCallback(() => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null }
    const sent = version.current
    const next = orderRef.current
    const p = (async () => {
      try {
        await reorderScheduleDays(scheduleId, next)
        onError?.(null)
      } catch (e) {
        onError?.(e instanceof Error ? e.message : 'That didn’t save')
        if (version.current === sent) setLocal(null)
        return
      }
      // The action's response carries the rebuilt page, so the server's order
      // is normally already this one; the effect below lets go as soon as it
      // is. Should it never arrive — someone else reordered in between — the
      // server's word wins.
      if (version.current !== sent) return
      if (same(idsRef.current, next)) setLocal(null)
      else setTimeout(() => { if (version.current === sent) setLocal(null) }, 3000)
    })()
    inFlight.current = p
    void p.finally(() => { if (inFlight.current === p) inFlight.current = null })
    return p
  }, [scheduleId, onError])

  useEffect(() => {
    if (local && !timer.current && !inFlight.current && same(ids, local)) setLocal(null)
  }, [ids, local])

  // Leaving with a press still waiting sends it rather than dropping it.
  useEffect(() => () => { if (timer.current) void send() }, [send])

  const move = useCallback((id: string, direction: 'up' | 'down') => {
    const cur = [...orderRef.current]
    const i = cur.indexOf(id)
    const j = direction === 'up' ? i - 1 : i + 1
    if (i < 0 || j < 0 || j >= cur.length) return
    ;[cur[i], cur[j]] = [cur[j], cur[i]]
    version.current++
    orderRef.current = cur
    setLocal(cur)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => { void send() }, WAIT_MS)
  }, [send])

  const value = useMemo<Ctx>(() => ({
    position: (id) => order.indexOf(id),
    count: order.length,
    move,
    isPending: () => Boolean(timer.current || inFlight.current),
    flush: async () => {
      if (timer.current) await send()
      else if (inFlight.current) await inFlight.current
    },
    dates,
  }), [order, move, send, dates])

  return (
    <DayOrderContext.Provider value={value}>
      <div className={`flex flex-col ${className ?? ''}`}>{children}</div>
    </DayOrderContext.Provider>
  )
}

function same(a: string[], b: string[]) {
  return a.length === b.length && a.every((x, i) => x === b[i])
}

export function useDayOrder() {
  return useContext(DayOrderContext)
}

/** A day's place in the list, for its `style`. Null outside a DayOrder. */
export function useDayOrderStyle(id: string | undefined) {
  const ctx = useContext(DayOrderContext)
  if (!ctx || !id) return undefined
  return { order: ctx.position(id) }
}

/** The parts of a day's title line that follow its position: the gutter
    number, the title when it's still on its "Day 3" default, and the date. */
export function DayPosition({
  id,
  index,
  title,
  date,
}: {
  id: string
  /** Where the server had it, for when there's no DayOrder around. */
  index: number
  title: string
  date: string | null
}) {
  const ctx = useContext(DayOrderContext)
  const at = ctx ? ctx.position(id) : index
  const shownDate = ctx ? ctx.dates[at] ?? null : date
  const isDefault = /^day\s*\d+$/i.test(title.trim())
  return (
    <>
      {!/^day\s*\d+\b/i.test(title.trim()) && (
        <span className="text-[11px] font-mono text-zinc-600 shrink-0">Day {at + 1}</span>
      )}
      <h3 className="font-semibold text-[15px] text-zinc-100 min-w-0">{isDefault ? `Day ${at + 1}` : title}</h3>
      {shownDate && (
        <span className="text-[10px] font-mono tabular-nums uppercase tracking-wide text-zinc-500 shrink-0">
          {shownDate}
        </span>
      )}
    </>
  )
}

/** A day's wrapper where nothing else carries its position — the full editor's
    cards, which aren't folds. */
export function DaySlot({ id, children }: { id: string; children: ReactNode }) {
  return <div style={useDayOrderStyle(id)}>{children}</div>
}
