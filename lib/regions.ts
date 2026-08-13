// Where a course happens, as a code rather than typed prose. Location stays
// free text for the place name ("Garfield Ledges", "Maui"); region is the part
// that has to match exactly, so a map tagged US-HI reaches every Hawaii course
// however the location was spelled.
//
// Codes are ISO: 'US-WA' / 'CA-BC' for subdivisions, plain 'FR' for a country
// with no subdivision list. Names are derived from the code at render time —
// only the codes are stored, and only the codes live here.

const US_SUBDIVISIONS =
  'AL,AK,AZ,AR,CA,CO,CT,DE,DC,FL,GA,HI,ID,IL,IN,IA,KS,KY,LA,ME,MD,MA,MI,MN,MS,MO,' +
  'MT,NE,NV,NH,NJ,NM,NY,NC,ND,OH,OK,OR,PA,RI,SC,SD,TN,TX,UT,VT,VA,WA,WV,WI,WY,' +
  'AS,GU,MP,PR,VI'

const US_NAMES: Record<string, string> = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California',
  CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware', DC: 'District of Columbia',
  FL: 'Florida', GA: 'Georgia', HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois',
  IN: 'Indiana', IA: 'Iowa', KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana',
  ME: 'Maine', MD: 'Maryland', MA: 'Massachusetts', MI: 'Michigan',
  MN: 'Minnesota', MS: 'Mississippi', MO: 'Missouri', MT: 'Montana',
  NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire', NJ: 'New Jersey',
  NM: 'New Mexico', NY: 'New York', NC: 'North Carolina', ND: 'North Dakota',
  OH: 'Ohio', OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania',
  RI: 'Rhode Island', SC: 'South Carolina', SD: 'South Dakota', TN: 'Tennessee',
  TX: 'Texas', UT: 'Utah', VT: 'Vermont', VA: 'Virginia', WA: 'Washington',
  WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming',
  AS: 'American Samoa', GU: 'Guam', MP: 'Northern Mariana Islands',
  PR: 'Puerto Rico', VI: 'U.S. Virgin Islands',
}

const CA_SUBDIVISIONS = 'AB,BC,MB,NB,NL,NS,NT,NU,ON,PE,QC,SK,YT'

const CA_NAMES: Record<string, string> = {
  AB: 'Alberta', BC: 'British Columbia', MB: 'Manitoba', NB: 'New Brunswick',
  NL: 'Newfoundland and Labrador', NS: 'Nova Scotia', NT: 'Northwest Territories',
  NU: 'Nunavut', ON: 'Ontario', PE: 'Prince Edward Island', QC: 'Quebec',
  SK: 'Saskatchewan', YT: 'Yukon',
}

export const US_STATES = US_SUBDIVISIONS.split(',').map((c) => ({ code: `US-${c}`, name: US_NAMES[c] }))
export const CA_PROVINCES = CA_SUBDIVISIONS.split(',').map((c) => ({ code: `CA-${c}`, name: CA_NAMES[c] }))

// The two countries we hold subdivisions for. Everywhere else is stored as the
// bare country code, so the list a picker shows is keyed off this.
export const SUBDIVISIONS: Record<string, { code: string; name: string }[]> = {
  US: US_STATES,
  CA: CA_PROVINCES,
}

// 'US-WA' → { country: 'US', sub: 'US-WA' }; 'FR' → { country: 'FR', sub: '' }.
export function splitRegion(code: string | null | undefined): { country: string; sub: string } {
  if (!code) return { country: '', sub: '' }
  const [country] = code.split('-')
  return { country, sub: code.includes('-') ? code : '' }
}

// Every ISO 3166-1 country, so a course somewhere unanticipated never needs a
// code added here. Names come from Intl, pinned to 'en' so server and client
// render the same string.
const COUNTRY_CODES =
  'AD,AE,AF,AG,AI,AL,AM,AO,AQ,AR,AT,AU,AW,AX,AZ,BA,BB,BD,BE,BF,BG,BH,BI,BJ,BL,' +
  'BM,BN,BO,BQ,BR,BS,BT,BV,BW,BY,BZ,CC,CD,CF,CG,CH,CI,CK,CL,CM,CN,CO,CR,CU,CV,' +
  'CW,CX,CY,CZ,DE,DJ,DK,DM,DO,DZ,EC,EE,EG,EH,ER,ES,ET,FI,FJ,FK,FM,FO,FR,GA,GB,' +
  'GD,GE,GF,GG,GH,GI,GL,GM,GN,GP,GQ,GR,GS,GT,GW,GY,HK,HM,HN,HR,HT,HU,ID,IE,IL,' +
  'IM,IN,IO,IQ,IR,IS,IT,JE,JM,JO,JP,KE,KG,KH,KI,KM,KN,KP,KR,KW,KY,KZ,LA,LB,LC,' +
  'LI,LK,LR,LS,LT,LU,LV,LY,MA,MC,MD,ME,MF,MG,MH,MK,ML,MM,MN,MO,MQ,MR,MS,MT,MU,' +
  'MV,MW,MX,MY,MZ,NA,NC,NE,NF,NG,NI,NL,NO,NP,NR,NU,NZ,OM,PA,PE,PF,PG,PH,PK,PL,' +
  'PM,PN,PS,PT,PW,PY,QA,RE,RO,RS,RU,RW,SA,SB,SC,SD,SE,SG,SH,SI,SJ,SK,SL,SM,SN,' +
  'SO,SR,SS,ST,SV,SX,SY,SZ,TC,TD,TF,TG,TH,TJ,TK,TL,TM,TN,TO,TR,TT,TV,TW,TZ,UA,' +
  'UG,UM,UY,UZ,VA,VC,VE,VG,VN,VU,WF,WS,YE,YT,ZA,ZM,ZW'

const displayNames = new Intl.DisplayNames(['en'], { type: 'region' })

function countryName(code: string): string {
  try {
    return displayNames.of(code) ?? code
  } catch {
    return code
  }
}

// One alphabetical list of every country, US and Canada included. A single flat
// list is what makes type-ahead work: in a native select, typing jumps within
// the whole list, so "F" reaches France instead of stopping at Florida.
export const COUNTRIES = COUNTRY_CODES.split(',')
  .map((code) => ({ code, name: countryName(code) }))
  .sort((a, b) => a.name.localeCompare(b.name))

// "Hawaii, United States" — the long form, for selects and detail lines.
export function regionLabel(code: string | null | undefined): string {
  if (!code) return ''
  const [country, sub] = code.split('-')
  if (!sub) return countryName(country)
  const name = country === 'US' ? US_NAMES[sub] : country === 'CA' ? CA_NAMES[sub] : null
  return name ? `${name}, ${countryName(country)}` : code
}

// "HI" / "BC" / "FR" — for badges and chips, where the long form won't fit.
export function regionShort(code: string | null | undefined): string {
  if (!code) return ''
  const [country, sub] = code.split('-')
  return sub || country
}

export function isValidRegion(code: string | null | undefined): boolean {
  if (!code) return false
  const [country, sub] = code.split('-')
  if (country === 'US') return sub in US_NAMES
  if (country === 'CA') return sub in CA_NAMES
  return !sub && COUNTRY_CODES.split(',').includes(country)
}
