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
// code added here.
//
// Written out rather than read from Intl.DisplayNames. Pinning the locale to
// 'en' was supposed to make the server and the browser agree and does not:
// they each carry their own copy of the CLDR data, and the two copies differ.
// Node said "Falkland Islands" where Chrome said "Falkland Islands (Islas
// Malvinas)", and likewise on Hong Kong, Macao and Palestine — four options
// whose text did not match the HTML they were hydrating, which threw out the
// whole form's tree and re-rendered it on the client. A browser release or a
// Node bump moves the set; nothing in the app can pin it.
//
// So the names are the app's own, written out in the order they are shown.
// Where the two disagreed, the shorter and plainer reading won. The order is
// written out for the same reason the names are: localeCompare reads the same
// divergent data, so a list sorted at render time could come out in a
// different order on the two sides and mismatch by position instead of by
// text. ~4KB in the bundle, and the picker renders the same string in the same
// place everywhere it is drawn, for good.
const COUNTRY_NAMES: Record<string, string> = {
  AF: "Afghanistan", AX: "Åland Islands", AL: "Albania",
  DZ: "Algeria", AD: "Andorra", AO: "Angola",
  AI: "Anguilla", AQ: "Antarctica", AG: "Antigua & Barbuda",
  AR: "Argentina", AM: "Armenia", AW: "Aruba",
  AU: "Australia", AT: "Austria", AZ: "Azerbaijan",
  BS: "Bahamas", BH: "Bahrain", BD: "Bangladesh",
  BB: "Barbados", BY: "Belarus", BE: "Belgium",
  BZ: "Belize", BJ: "Benin", BM: "Bermuda",
  BT: "Bhutan", BO: "Bolivia", BA: "Bosnia & Herzegovina",
  BW: "Botswana", BV: "Bouvet Island", BR: "Brazil",
  IO: "British Indian Ocean Territory", VG: "British Virgin Islands", BN: "Brunei",
  BG: "Bulgaria", BF: "Burkina Faso", BI: "Burundi",
  KH: "Cambodia", CM: "Cameroon", CA: "Canada",
  CV: "Cape Verde", BQ: "Caribbean Netherlands", KY: "Cayman Islands",
  CF: "Central African Republic", TD: "Chad", CL: "Chile",
  CN: "China", CX: "Christmas Island", CC: "Cocos (Keeling) Islands",
  CO: "Colombia", KM: "Comoros", CG: "Congo - Brazzaville",
  CD: "Congo - Kinshasa", CK: "Cook Islands", CR: "Costa Rica",
  CI: "Côte d’Ivoire", HR: "Croatia", CU: "Cuba",
  CW: "Curaçao", CY: "Cyprus", CZ: "Czechia",
  DK: "Denmark", DJ: "Djibouti", DM: "Dominica",
  DO: "Dominican Republic", EC: "Ecuador", EG: "Egypt",
  SV: "El Salvador", GQ: "Equatorial Guinea", ER: "Eritrea",
  EE: "Estonia", SZ: "Eswatini", ET: "Ethiopia",
  FK: "Falkland Islands", FO: "Faroe Islands", FJ: "Fiji",
  FI: "Finland", FR: "France", GF: "French Guiana",
  PF: "French Polynesia", TF: "French Southern Territories", GA: "Gabon",
  GM: "Gambia", GE: "Georgia", DE: "Germany",
  GH: "Ghana", GI: "Gibraltar", GR: "Greece",
  GL: "Greenland", GD: "Grenada", GP: "Guadeloupe",
  GT: "Guatemala", GG: "Guernsey", GN: "Guinea",
  GW: "Guinea-Bissau", GY: "Guyana", HT: "Haiti",
  HM: "Heard & McDonald Islands", HN: "Honduras", HK: "Hong Kong",
  HU: "Hungary", IS: "Iceland", IN: "India",
  ID: "Indonesia", IR: "Iran", IQ: "Iraq",
  IE: "Ireland", IM: "Isle of Man", IL: "Israel",
  IT: "Italy", JM: "Jamaica", JP: "Japan",
  JE: "Jersey", JO: "Jordan", KZ: "Kazakhstan",
  KE: "Kenya", KI: "Kiribati", KW: "Kuwait",
  KG: "Kyrgyzstan", LA: "Laos", LV: "Latvia",
  LB: "Lebanon", LS: "Lesotho", LR: "Liberia",
  LY: "Libya", LI: "Liechtenstein", LT: "Lithuania",
  LU: "Luxembourg", MO: "Macao", MG: "Madagascar",
  MW: "Malawi", MY: "Malaysia", MV: "Maldives",
  ML: "Mali", MT: "Malta", MH: "Marshall Islands",
  MQ: "Martinique", MR: "Mauritania", MU: "Mauritius",
  YT: "Mayotte", MX: "Mexico", FM: "Micronesia",
  MD: "Moldova", MC: "Monaco", MN: "Mongolia",
  ME: "Montenegro", MS: "Montserrat", MA: "Morocco",
  MZ: "Mozambique", MM: "Myanmar (Burma)", NA: "Namibia",
  NR: "Nauru", NP: "Nepal", NL: "Netherlands",
  NC: "New Caledonia", NZ: "New Zealand", NI: "Nicaragua",
  NE: "Niger", NG: "Nigeria", NU: "Niue",
  NF: "Norfolk Island", KP: "North Korea", MK: "North Macedonia",
  NO: "Norway", OM: "Oman", PK: "Pakistan",
  PW: "Palau", PS: "Palestine", PA: "Panama",
  PG: "Papua New Guinea", PY: "Paraguay", PE: "Peru",
  PH: "Philippines", PN: "Pitcairn Islands", PL: "Poland",
  PT: "Portugal", QA: "Qatar", RE: "Réunion",
  RO: "Romania", RU: "Russia", RW: "Rwanda",
  WS: "Samoa", SM: "San Marino", ST: "São Tomé & Príncipe",
  SA: "Saudi Arabia", SN: "Senegal", RS: "Serbia",
  SC: "Seychelles", SL: "Sierra Leone", SG: "Singapore",
  SX: "Sint Maarten", SK: "Slovakia", SI: "Slovenia",
  SB: "Solomon Islands", SO: "Somalia", ZA: "South Africa",
  GS: "South Georgia & South Sandwich Islands", KR: "South Korea", SS: "South Sudan",
  ES: "Spain", LK: "Sri Lanka", BL: "St. Barthélemy",
  SH: "St. Helena", KN: "St. Kitts & Nevis", LC: "St. Lucia",
  MF: "St. Martin", PM: "St. Pierre & Miquelon", VC: "St. Vincent & Grenadines",
  SD: "Sudan", SR: "Suriname", SJ: "Svalbard & Jan Mayen",
  SE: "Sweden", CH: "Switzerland", SY: "Syria",
  TW: "Taiwan", TJ: "Tajikistan", TZ: "Tanzania",
  TH: "Thailand", TL: "Timor-Leste", TG: "Togo",
  TK: "Tokelau", TO: "Tonga", TT: "Trinidad & Tobago",
  TN: "Tunisia", TR: "Türkiye", TM: "Turkmenistan",
  TC: "Turks & Caicos Islands", TV: "Tuvalu", UM: "U.S. Outlying Islands",
  UG: "Uganda", UA: "Ukraine", AE: "United Arab Emirates",
  GB: "United Kingdom", US: "United States", UY: "Uruguay",
  UZ: "Uzbekistan", VU: "Vanuatu", VA: "Vatican City",
  VE: "Venezuela", VN: "Vietnam", WF: "Wallis & Futuna",
  EH: "Western Sahara", YE: "Yemen", ZM: "Zambia",
  ZW: "Zimbabwe",
}

const COUNTRY_CODES = Object.keys(COUNTRY_NAMES).join(',')

function countryName(code: string): string {
  return COUNTRY_NAMES[code] ?? code
}

// One alphabetical list of every country, US and Canada included. A single flat
// list is what makes type-ahead work: in a native select, typing jumps within
// the whole list, so "F" reaches France instead of stopping at Florida.
//
// Already in order — see COUNTRY_NAMES. The subdivision countries are unioned
// in rather than trusted to the list above, which had lost both of them: a
// country you hold states for and cannot pick is the worst cell in the table —
// every US course, and no way back to one once another country is chosen.
export const COUNTRIES = [...new Set([...COUNTRY_CODES.split(','), ...Object.keys(SUBDIVISIONS)])]
  .map((code) => ({ code, name: countryName(code) }))

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
