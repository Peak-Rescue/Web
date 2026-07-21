'use client'

import { useEffect } from 'react'

// Opens the browser's print dialog on load (used by the admin "Print / PDF"
// link — the printed page is the client-facing quote in its light print theme).
export default function PrintTrigger() {
  useEffect(() => {
    const t = setTimeout(() => window.print(), 400) // let the hero image land first
    return () => clearTimeout(t)
  }, [])
  return null
}
