// Whose clock decides what day it is.
//
// A stored yyyy-mm-dd has no timezone and needs none — May 3rd is May 3rd in
// Ouray, Honolulu and Warsaw, which is why course dates are compared as
// strings and the calendar draws them without a clock anywhere near it.
//
// "Now" is the opposite: it is an instant, and turning it into a date is a
// question about where you are standing. Every place that did it read the
// server's clock, which on Vercel is UTC — so the portal decided the day had
// changed at 6pm in the canyon, folding away the morning of the day people
// were still teaching, and at 2pm on a course in Hawaii. This is where that
// question gets answered instead.
//
// Two answers, and which one you want depends on what is being asked:
//
//   • One course — is today a day of *this* course, has it finished, does its
//     morning stand open — is asked on the clock where the course runs.
//   • Everything else — a list of courses, a quote's expiry, a reminder we
//     send — is asked on the office clock. It is Peak Rescue asking, from
//     Colorado, about work spread over a dozen timezones.

/** The office. Also what an unmapped or unset region falls back to: most
    courses are here, and a course with no region is one nobody has told us
    about yet, not one on the other side of the world. */
export const HOME_ZONE = 'America/Denver'

// Region codes are ISO ('US-CO', 'CA-AB', or a bare country like 'PL'), so the
// zone is looked up from the code rather than from the prose in `location`.
//
// A state that straddles two zones gets the one most of it is in — Florida
// eastern, Texas central, and so on. Wrong for the Panhandle and for El Paso,
// and wrong by one hour, which is not enough to move a date except within an
// hour of midnight. Hang the zone off the venue if that ever matters; the
// venue knows exactly where it is and the state does not.
const US_ZONES: Record<string, string> = {
  // Eastern
  CT: 'America/New_York', DE: 'America/New_York', DC: 'America/New_York',
  FL: 'America/New_York', GA: 'America/New_York', IN: 'America/New_York',
  KY: 'America/New_York', ME: 'America/New_York', MD: 'America/New_York',
  MA: 'America/New_York', MI: 'America/New_York', NH: 'America/New_York',
  NJ: 'America/New_York', NY: 'America/New_York', NC: 'America/New_York',
  OH: 'America/New_York', PA: 'America/New_York', RI: 'America/New_York',
  SC: 'America/New_York', VT: 'America/New_York', VA: 'America/New_York',
  WV: 'America/New_York',
  // Central
  AL: 'America/Chicago', AR: 'America/Chicago', IL: 'America/Chicago',
  IA: 'America/Chicago', KS: 'America/Chicago', LA: 'America/Chicago',
  MN: 'America/Chicago', MS: 'America/Chicago', MO: 'America/Chicago',
  NE: 'America/Chicago', ND: 'America/Chicago', OK: 'America/Chicago',
  SD: 'America/Chicago', TN: 'America/Chicago', TX: 'America/Chicago',
  WI: 'America/Chicago',
  // Mountain — Arizona keeps its own, because it does not move for daylight
  // saving and spends half the year on Pacific time in all but name.
  AZ: 'America/Phoenix', CO: 'America/Denver', ID: 'America/Denver',
  MT: 'America/Denver', NM: 'America/Denver', UT: 'America/Denver',
  WY: 'America/Denver',
  // Pacific and out
  CA: 'America/Los_Angeles', NV: 'America/Los_Angeles',
  OR: 'America/Los_Angeles', WA: 'America/Los_Angeles',
  AK: 'America/Anchorage', HI: 'Pacific/Honolulu',
  // Territories
  PR: 'America/Puerto_Rico', VI: 'America/Puerto_Rico',
  GU: 'Pacific/Guam', MP: 'Pacific/Guam', AS: 'Pacific/Pago_Pago',
}

const CA_ZONES: Record<string, string> = {
  AB: 'America/Edmonton', BC: 'America/Vancouver', MB: 'America/Winnipeg',
  NB: 'America/Moncton', NL: 'America/St_Johns', NS: 'America/Halifax',
  NT: 'America/Yellowknife', NU: 'America/Iqaluit', ON: 'America/Toronto',
  PE: 'America/Halifax', QC: 'America/Toronto', SK: 'America/Regina',
  YT: 'America/Whitehorse',
}

// Countries we have taught in or plausibly will. An unlisted one falls back to
// the office rather than guessing, and adding one is a line.
const COUNTRY_ZONES: Record<string, string> = {
  AT: 'Europe/Vienna', AU: 'Australia/Sydney', BE: 'Europe/Brussels',
  CH: 'Europe/Zurich', CL: 'America/Santiago', CZ: 'Europe/Prague',
  DE: 'Europe/Berlin', DK: 'Europe/Copenhagen', ES: 'Europe/Madrid',
  FI: 'Europe/Helsinki', FR: 'Europe/Paris', GB: 'Europe/London',
  GR: 'Europe/Athens', IE: 'Europe/Dublin', IL: 'Asia/Jerusalem',
  IS: 'Atlantic/Reykjavik', IT: 'Europe/Rome', JO: 'Asia/Amman',
  JP: 'Asia/Tokyo', KE: 'Africa/Nairobi', MX: 'America/Mexico_City',
  NL: 'Europe/Amsterdam', NO: 'Europe/Oslo', NP: 'Asia/Kathmandu',
  NZ: 'Pacific/Auckland', PL: 'Europe/Warsaw', PT: 'Europe/Lisbon',
  RO: 'Europe/Bucharest', SE: 'Europe/Stockholm', SK: 'Europe/Bratislava',
  UA: 'Europe/Kyiv', AE: 'Asia/Dubai', ZA: 'Africa/Johannesburg',
}

/** The clock a course runs on, from its region code. */
export function courseZone(region: string | null | undefined): string {
  if (!region) return HOME_ZONE
  const [country, sub] = region.split('-')
  if (country === 'US' && sub) return US_ZONES[sub] ?? HOME_ZONE
  if (country === 'CA' && sub) return CA_ZONES[sub] ?? HOME_ZONE
  return COUNTRY_ZONES[country] ?? HOME_ZONE
}

/** What day it is where `zone` is, as yyyy-mm-dd. `now` is an argument so the
    rollover can be tested rather than waited for. */
export function todayIn(zone: string = HOME_ZONE, now: Date = new Date()): string {
  let parts
  try {
    parts = new Intl.DateTimeFormat('en-US', {
      timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(now)
  } catch {
    // An unknown zone must not take a page down over what day it is.
    parts = new Intl.DateTimeFormat('en-US', {
      timeZone: HOME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(now)
  }
  const at = (type: string) => parts.find((p) => p.type === type)!.value
  return `${at('year')}-${at('month')}-${at('day')}`
}

/** Today at the office — the answer for anything Peak Rescue asks about work
    spread across timezones, rather than about one course in one canyon. */
export function todayHere(now: Date = new Date()): string {
  return todayIn(HOME_ZONE, now)
}
