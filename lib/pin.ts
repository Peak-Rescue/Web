// A pin, from whatever was pasted: typed coordinates, or a Google Maps link.
//
// Coordinates are what we keep. Most meeting points are trailheads and
// turnouts with no address, and the pin already opens in whichever map the
// reader uses. A Google Maps link is accepted because that is what "Share →
// Copy link" hands you, and the coordinates are in it once the short link is
// followed.

/** "20.92270,-156.28587": five places is about a metre, which is more than a
    parking spot needs and what every pin we hold already uses. */
export function formatPin(lat: number, lng: number): string {
  return `${lat.toFixed(5)},${lng.toFixed(5)}`
}

function valid(lat: number, lng: number) {
  return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180
}

/** Typed coordinates, in the shapes people paste them: "20.9227, -156.2858",
    with or without the space, or a CalTopo "20.9227 -156.2858". Null when the
    text is not just a pair of numbers. */
export function pinFromCoords(text: string): string | null {
  const m = text.trim().match(/^(-?\d{1,2}(?:\.\d+)?)\s*[,\s]\s*(-?\d{1,3}(?:\.\d+)?)$/)
  if (!m) return null
  const lat = Number(m[1]), lng = Number(m[2])
  return valid(lat, lng) ? formatPin(lat, lng) : null
}

/** The pin in a full Google Maps URL. The place's own position (`!3d…!4d…`)
    comes first: `@lat,lng` is where the map was centred when the link was
    copied, which for a place link is close and for a dragged map is not. */
export function pinFromGoogleUrl(url: string): string | null {
  const place = url.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/)
  const query = url.match(/[?&](?:q|query|ll|destination)=(-?\d+(?:\.\d+)?)(?:,|%2C)\s*(-?\d+(?:\.\d+)?)/i)
  const centre = url.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/)
  for (const m of [place, query, centre]) {
    if (!m) continue
    const lat = Number(m[1]), lng = Number(m[2])
    if (valid(lat, lng)) return formatPin(lat, lng)
  }
  return null
}

/** Whether a link is Google's, and so worth following. Only these hosts are
    ever fetched: the server follows the link, and an open fetch of any URL
    pasted into a form is a way to make it call anywhere. */
export function isGoogleMapsUrl(text: string): boolean {
  try {
    const u = new URL(text.trim())
    if (u.protocol !== 'https:') return false
    const host = u.hostname.toLowerCase()
    if (host === 'maps.app.goo.gl') return true
    if (host === 'goo.gl') return u.pathname.startsWith('/maps')
    if (host === 'maps.google.com') return true
    return /^(www\.)?google\.[a-z.]+$/.test(host) && u.pathname.startsWith('/maps')
  } catch {
    return false
  }
}
