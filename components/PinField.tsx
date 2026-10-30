'use client'

import { useRef, useState } from 'react'
import { resolvePin } from '@/app/admin/sites/actions'
import { pinFromCoords } from '@/lib/pin'
import { errorFrom } from '@/lib/action-result'
import InfoHint from '@/components/InfoHint'

// Where a place is, as coordinates — typed, or read out of a Google Maps link
// pasted here. The link is turned into coordinates the moment it lands, so
// what is saved is always a pin and what is on screen is what will be saved.
export default function PinField({
  value,
  onChange,
  className,
  labelClassName,
}: {
  value: string
  onChange: (coords: string) => void
  className: string
  labelClassName: string
}) {
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Disabling the box while a link is read blurs it, and the blur would read
  // the same link a second time.
  const reading = useRef(false)

  async function settle(text: string) {
    const t = text.trim()
    if (reading.current) return
    setError(null)
    setNote(null)
    if (!t) return
    const typed = pinFromCoords(t)
    if (typed) {
      if (typed !== value) onChange(typed)
      return
    }
    setBusy(true)
    reading.current = true
    try {
      const r = await resolvePin(t)
      if ('error' in r) { setError(r.error); return }
      onChange(r.coords)
      setNote('From the Google Maps link')
    } catch (e) {
      setError(errorFrom(e, 'Couldn’t read that link'))
    } finally {
      reading.current = false
      setBusy(false)
    }
  }

  return (
    <div>
      <span className={labelClassName}>
        <span className="inline-flex items-center gap-1">
          Pin
          <InfoHint text="Coordinates, or a Google Maps link: open the place in Google Maps, then Share → Copy link, and paste it here. It is turned into coordinates, which open in whatever map the reader uses." />
        </span>
      </span>
      <input
        value={value}
        disabled={busy}
        spellCheck={false}
        onChange={(e) => onChange(e.target.value)}
        // A paste is the whole answer, so it is read straight away rather than
        // waiting for the box to lose focus.
        onPaste={(e) => {
          const pasted = e.clipboardData.getData('text')
          if (!pasted.trim()) return
          e.preventDefault()
          onChange(pasted.trim())
          void settle(pasted)
        }}
        onBlur={(e) => void settle(e.target.value)}
        aria-label="Pin"
        className={`${className} font-mono text-[12px]`}
      />
      {busy && <span className="block mt-1 text-[11px] text-zinc-500">Finding the pin…</span>}
      {!busy && note && <span className="block mt-1 text-[11px] text-zinc-500">{note}</span>}
      {!busy && error && <span className="block mt-1 text-[11px] text-pr-red">{error}</span>}
    </div>
  )
}
