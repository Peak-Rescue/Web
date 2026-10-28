'use client'

import { useState } from 'react'

// A pin you can press, and choose what opens it.
//
// Coordinates were monospace text to select, copy and paste into whatever map
// you use — on a phone, in a car park, with gloves on. They are the one thing
// on a meeting point that is only useful somewhere else.
//
// Pressing them used to guess: Apple Maps on an iPhone, the system chooser on
// Android, a tab anywhere else. The guess is wrong for anyone who prefers the
// other map, and iOS has no chooser of its own to fall back on — so the menu
// is ours. It asks once per press and remembers nothing, because the right
// answer differs between the drive out and the write-up afterwards.
//
// What is offered is decided on the press rather than at render: a menu whose
// items depend on the device cannot be built on the server, and building it
// there anyway is a hydration error for a menu nobody has opened.

type Choice = { label: string; href: string }

export default function Coords({
  value,
  className = '',
}: {
  value: string
  /** The look of the line it replaces, so this is a swap and not a redesign. */
  className?: string
}) {
  const [choices, setChoices] = useState<Choice[] | null>(null)
  const [copied, setCopied] = useState(false)

  const pin = value.trim()
  // "20.81099, -156.11467" and "20.81099,-156.11467" are the same pin; a map
  // URL wants it without the space.
  const plain = pin.replace(/\s+/g, '')
  const query = encodeURIComponent(plain)

  function open() {
    const ua = navigator.userAgent
    const apple = /iPhone|iPad|iPod|Macintosh/i.test(ua)
    const android = /Android/i.test(ua)
    setChoices([
      // Google's https address is a universal link: with the app installed it
      // opens the app, and without it opens the map in a tab. One row that is
      // right either way beats comgooglemaps://, which does nothing at all
      // when the app is missing.
      { label: 'Google Maps', href: `https://www.google.com/maps/search/?api=1&query=${query}` },
      ...(apple ? [{ label: 'Apple Maps', href: `maps://?q=${query}` }] : []),
      // Android's own chooser, for the maps we have not thought of.
      ...(android ? [{ label: 'Another app…', href: `geo:${plain}?q=${query}` }] : []),
      { label: 'CalTopo', href: `https://caltopo.com/map.html#ll=${plain}&z=15` },
    ])
  }

  return (
    <span className="relative inline-block">
      <button
        type="button"
        onClick={open}
        title="Open in maps"
        className={`font-mono hover:text-white underline-offset-2 hover:underline transition-colors ${className}`}
      >
        {pin}
      </button>

      {choices && (
        <>
          {/* Pressing anywhere else closes it, which is what every menu on a
              phone does and the only way out that needs no instruction. */}
          <button
            type="button"
            aria-label="Close"
            onClick={() => { setChoices(null); setCopied(false) }}
            className="fixed inset-0 z-40 cursor-default"
          />
          <span className="absolute left-0 top-full z-50 mt-1 min-w-44 rounded-lg border border-zinc-700 bg-zinc-900 py-1 shadow-xl">
            {choices.map((c) => (
              <a
                key={c.label}
                href={c.href}
                target="_blank"
                rel="noreferrer"
                onClick={() => setChoices(null)}
                className="block px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800 hover:text-white transition-colors"
              >
                {c.label}
              </a>
            ))}
            {/* For the map nobody listed, and for a text message to somebody
                standing at the wrong gate. */}
            <button
              type="button"
              onClick={async () => {
                try { await navigator.clipboard.writeText(plain); setCopied(true) }
                catch { setCopied(false) }
              }}
              className="block w-full text-left px-3 py-1.5 text-xs text-zinc-400 hover:bg-zinc-800 hover:text-white transition-colors"
            >
              {copied ? 'Copied' : 'Copy coordinates'}
            </button>
          </span>
        </>
      )}
    </span>
  )
}
