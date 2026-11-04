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

/** Typed coordinates, in the shapes people paste them: decimal degrees
    ("20.9227, -156.2858", with or without the comma — CalTopo leaves it out),
    and the forms a GPS or a radio call gives — degrees and decimal minutes
    ("N45 40.307 W111 03.636", the Garmin default), degrees minutes seconds
    ("45°40'18"N 111°03'38"W"), hemisphere letters on decimal degrees, and
    the grids search and rescue reads out — UTM ("12T 495281 5057583") and
    MGRS / USNG ("12T VR 95280 57582"). Null when the text is not one of them. */
export function pinFromCoords(text: string): string | null {
  const t = text.trim()
  const m = t.match(/^(-?\d{1,2}(?:\.\d+)?)\s*[,\s]\s*(-?\d{1,3}(?:\.\d+)?)$/)
  if (m) {
    const lat = Number(m[1]), lng = Number(m[2])
    return valid(lat, lng) ? formatPin(lat, lng) : null
  }
  return pinFromGrid(t) ?? pinFromAngles(t)
}

type Angle = { value: number; hemi: 'N' | 'S' | 'E' | 'W' | null }

// One half of a pair: degrees, then minutes and seconds if given, with a
// hemisphere letter at either end. Minutes and seconds must be under sixty
// and only the last number may carry a decimal, or "45.5 30" would be read as
// something nobody meant.
function readAngle(part: string): Angle | null {
  const hemis = part.match(/[NSEW]/g) ?? []
  if (hemis.length > 1) return null
  const nums = part.replace(/[NSEW]/g, ' ').match(/-?\d+(?:\.\d+)?/g)
  if (!nums || nums.length > 3) return null
  if (nums.slice(0, -1).some((n) => n.includes('.'))) return null
  const [d, min = 0, sec = 0] = nums.map(Number)
  if (min >= 60 || sec >= 60 || min < 0 || sec < 0) return null
  const hemi = (hemis[0] ?? null) as Angle['hemi']
  const size = Math.abs(d) + min / 60 + sec / 3600
  return { value: d < 0 || hemi === 'S' || hemi === 'W' ? -size : size, hemi }
}

function pinFromAngles(text: string): string | null {
  // Symbols to spaces, letters to capitals: what is left is numbers and N/S/E/W.
  const t = text.toUpperCase().replace(/[°º˚'’′"”″]/g, ' ').replace(/\s+/g, ' ').trim()
  if (/[^0-9NSEW.,\s-]/.test(t)) return null
  let parts: string[]
  if (t.includes(',')) {
    parts = t.split(',')
  } else {
    // No comma: the hemisphere letters say where one half ends. Leading
    // letters ("N45 40.3 W111 3.6") start each half; trailing ones
    // ("45 40 18 N 111 3 38 W") finish them.
    const at = [...t.matchAll(/[NSEW]/g)].map((x) => x.index!)
    if (at.length !== 2) return null
    parts = at[0] === 0 ? [t.slice(0, at[1]), t.slice(at[1])] : [t.slice(0, at[0] + 1), t.slice(at[0] + 1)]
  }
  if (parts.length !== 2) return null
  const [a, b] = parts.map((p) => readAngle(p.trim()))
  if (!a || !b) return null
  // Letters decide which is which when given; otherwise latitude comes first.
  const latFirst = !(a.hemi === 'E' || a.hemi === 'W' || b.hemi === 'N' || b.hemi === 'S')
  const [lat, lng] = latFirst ? [a, b] : [b, a]
  if (lat.hemi === 'E' || lat.hemi === 'W' || lng.hemi === 'N' || lng.hemi === 'S') return null
  return valid(lat.value, lng.value) ? formatPin(lat.value, lng.value) : null
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

// ── UTM and MGRS / USNG ──────────────────────────────────────────────────
//
// Grid references as a GPS, CalTopo or a radio call gives them, turned into
// latitude and longitude on WGS84. The inverse Transverse Mercator series
// below is good to well under a metre inside a zone, which is all a meeting
// point asks of it.

const BANDS = 'CDEFGHJKLMNPQRSTUVWX' // 8° each from 80°S; X runs to 84°N

function utmToLatLng(zone: number, northern: boolean, easting: number, northing: number): { lat: number; lng: number } | null {
  if (zone < 1 || zone > 60) return null
  const a = 6378137, f = 1 / 298.257223563, k0 = 0.9996
  const e2 = f * (2 - f), ep2 = e2 / (1 - e2)
  const x = easting - 500000
  const y = northern ? northing : northing - 10000000
  const mu = y / k0 / (a * (1 - e2 / 4 - (3 * e2 ** 2) / 64 - (5 * e2 ** 3) / 256))
  const e1 = (1 - Math.sqrt(1 - e2)) / (1 + Math.sqrt(1 - e2))
  const phi1 = mu
    + (1.5 * e1 - (27 / 32) * e1 ** 3) * Math.sin(2 * mu)
    + ((21 / 16) * e1 ** 2 - (55 / 32) * e1 ** 4) * Math.sin(4 * mu)
    + ((151 / 96) * e1 ** 3) * Math.sin(6 * mu)
    + ((1097 / 512) * e1 ** 4) * Math.sin(8 * mu)
  const sin = Math.sin(phi1), cos = Math.cos(phi1), tan = Math.tan(phi1)
  const C1 = ep2 * cos ** 2, T1 = tan ** 2
  const N1 = a / Math.sqrt(1 - e2 * sin ** 2)
  const R1 = (a * (1 - e2)) / (1 - e2 * sin ** 2) ** 1.5
  const D = x / (N1 * k0)
  const lat = phi1 - ((N1 * tan) / R1) * (
    D ** 2 / 2
    - ((5 + 3 * T1 + 10 * C1 - 4 * C1 ** 2 - 9 * ep2) * D ** 4) / 24
    + ((61 + 90 * T1 + 298 * C1 + 45 * T1 ** 2 - 252 * ep2 - 3 * C1 ** 2) * D ** 6) / 720
  )
  const lng = ((zone - 1) * 6 - 180 + 3) * (Math.PI / 180) + (
    D - ((1 + 2 * T1 + C1) * D ** 3) / 6
    + ((5 - 2 * C1 + 28 * T1 - 3 * C1 ** 2 + 8 * ep2 + 24 * T1 ** 2) * D ** 5) / 120
  ) / cos
  const out = { lat: (lat * 180) / Math.PI, lng: (lng * 180) / Math.PI }
  return valid(out.lat, out.lng) ? out : null
}

// The latitude band's own range, so an MGRS northing — which repeats every
// 2,000 km — can be put back in the right one.
function bandRange(band: string): [number, number] | null {
  const i = BANDS.indexOf(band)
  if (i < 0) return null
  const south = -80 + i * 8
  return [south, band === 'X' ? 84 : south + 8]
}

function pinFromGrid(text: string): string | null {
  const t = text.toUpperCase()
    .replace(/\b(ZONE|UTM|MGRS|USNG|WGS ?84|NAD ?83)\b/g, ' ')
    .replace(/[,;:]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  // MGRS / USNG: zone, band, the 100 km square's two letters, then an even
  // run of digits split in half — together or as two groups.
  const g = t.match(/^(\d{1,2}) ?([C-HJ-NP-X]) ?([A-HJ-NP-Z])([A-HJ-NP-V]) ?(\d+)(?: (\d+))?$/)
  if (g) {
    const zone = Number(g[1])
    let east = g[5], north = g[6]
    if (north === undefined) {
      if (east.length % 2) return null
      north = east.slice(east.length / 2)
      east = east.slice(0, east.length / 2)
    }
    if (east.length !== north.length || east.length < 1 || east.length > 5) return null
    const scale = 10 ** (5 - east.length)
    const cols = ['ABCDEFGH', 'JKLMNPQR', 'STUVWXYZ'][(zone - 1) % 3]
    const col = cols.indexOf(g[3])
    if (col < 0) return null
    const rows = 'ABCDEFGHJKLMNPQRSTUV'
    const row = (rows.indexOf(g[4]) - (zone % 2 === 0 ? 5 : 0) + 20) % 20
    const easting = (col + 1) * 100000 + Number(east) * scale
    const within = (row * 100000 + Number(north) * scale) % 2000000
    const range = bandRange(g[2])
    if (!range) return null
    const northern = g[2] >= 'N'
    // The northing repeats every 2,000 km; the band says which repeat.
    for (let k = 0; k < 5; k++) {
      const pos = utmToLatLng(zone, northern, easting, within + k * 2000000)
      if (pos && pos.lat >= range[0] - 0.5 && pos.lat <= range[1] + 0.5) return formatPin(pos.lat, pos.lng)
    }
    return null
  }

  // UTM: zone, band or hemisphere if given, easting, northing — bare, or
  // marked E and N before or after. No letter is read as the northern
  // hemisphere, where every course we run is.
  const u =
    t.match(/^(\d{1,2}) ?([C-HJ-NP-X])? E ?(\d{6}(?:\.\d+)?) N ?(\d{6,8}(?:\.\d+)?)$/) ??
    t.match(/^(\d{1,2}) ?([C-HJ-NP-X])? (\d{6}(?:\.\d+)?) ?M? ?E? (\d{6,8}(?:\.\d+)?) ?M? ?N?$/)
  if (u) {
    const zone = Number(u[1])
    const band = u[2] ?? null
    const pos = utmToLatLng(zone, !band || band >= 'N', Number(u[3]), Number(u[4]))
    if (!pos) return null
    // A band letter has to agree with where the numbers land.
    const range = band ? bandRange(band) : null
    if (range && (pos.lat < range[0] - 0.5 || pos.lat > range[1] + 0.5)) return null
    return formatPin(pos.lat, pos.lng)
  }
  return null
}
