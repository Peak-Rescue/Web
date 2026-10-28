'use client'

// A pin you can press.
//
// Coordinates were a line of monospace text to select, copy, and paste into
// whatever map you use — on a phone, in a car park, with gloves on. They are
// the one thing on a meeting point that is only useful somewhere else, so the
// row opens that somewhere else instead of asking you to carry it there.
//
// Which app depends on where the press happens, decided at the click and not
// at render: a device that knows what to do with `geo:` is offered the
// chooser it already has, iOS is handed Apple Maps, and anything else gets a
// map in a tab. Deciding this while rendering would mean the server and the
// browser disagreeing about the href, which is a hydration error for the sake
// of a link nobody has pressed yet.

export default function Coords({
  value,
  className = '',
}: {
  value: string
  /** The look of the line it replaces, so this is a swap and not a redesign. */
  className?: string
}) {
  const pin = value.trim()
  // "20.81099, -156.11467" and "20.81099,-156.11467" are the same pin; a map
  // URL wants it without the space.
  const query = encodeURIComponent(pin.replace(/\s+/g, ''))

  return (
    <a
      href={`https://www.google.com/maps/search/?api=1&query=${query}`}
      target="_blank"
      rel="noreferrer"
      title="Open in maps"
      onClick={(e) => {
        const ua = navigator.userAgent
        // Android and anything else that registers geo: gets its own chooser,
        // which is the whole point — your map, not ours.
        const scheme = /Android/i.test(ua)
          ? `geo:${query}?q=${query}`
          : /iPhone|iPad|iPod|Macintosh/i.test(ua) && 'ontouchend' in document
            ? `maps://?q=${query}`
            : null
        if (!scheme) return
        e.preventDefault()
        window.location.href = scheme
      }}
      className={`font-mono hover:text-white underline-offset-2 hover:underline transition-colors ${className}`}
    >
      {pin}
    </a>
  )
}
