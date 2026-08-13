'use client'

import { useSyncExternalStore } from 'react'

// What each COA is quoting at *right now*, as its panel is being typed in.
//
// The server-rendered price on the course page is a snapshot: it only moves
// after the estimate autosaves, revalidates, and the whole page re-renders —
// seconds behind the keystroke. Anything offering to pull a COA's price in
// that window would pull the old one. So the panel publishes its live number
// here and the pullers read from here first, falling back to the server value
// for COAs whose panel isn't mounted.
//
// Module-level rather than a context: the panels and the quote fields are
// siblings under a server component, with no client boundary in common.

let prices: Record<string, number> = {}
const listeners = new Set<() => void>()
const EMPTY: Record<string, number> = {}

function emit() {
  for (const l of listeners) l()
}

export function publishCoaPrice(estimateId: string, price: number) {
  if (prices[estimateId] === price) return
  prices = { ...prices, [estimateId]: price }
  emit()
}

// On unmount — a COA whose panel is gone has no live price, only the
// server's. Leaving a stale entry behind would outlive the estimate itself.
export function retractCoaPrice(estimateId: string) {
  if (!(estimateId in prices)) return
  const next = { ...prices }
  delete next[estimateId]
  prices = next
  emit()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function getSnapshot() {
  return prices
}

function getServerSnapshot() {
  return EMPTY
}

export function useLiveCoaPrices(): Record<string, number> {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}
