// ADP department codes, transcribed from the Employee Handbook.
//
// The handbook is emphatic about the one thing that trips everybody: the
// paycode field is left BLANK and this goes in the department field. It is
// the rate for the day — travel is paid differently from teaching, and a
// level 2 differently from a lead — so the code is the only thing on a
// timesheet row that carries money.
//
// Two entities bill separately and have parallel ladders. Peak Rescue is the
// usual one; PR Service exists and is kept here so the list is the handbook's
// list and not a subset somebody has to remember is a subset.

export type PayEntity = 'Peak Rescue' | 'PR Service'

export type PayCode = {
  code: string
  entity: PayEntity
  label: string
  rate: number
  /** True for the code a travel day takes, which is generated rather than chosen. */
  travel?: boolean
}

export const PAY_CODES: PayCode[] = [
  { code: '07597T', entity: 'Peak Rescue', label: 'Travel', rate: 20, travel: true },
  { code: '07597S', entity: 'Peak Rescue', label: 'Shadow', rate: 25 },
  { code: '075971', entity: 'Peak Rescue', label: 'Level 1', rate: 40 },
  { code: '075972', entity: 'Peak Rescue', label: 'Level 2', rate: 43 },
  { code: '075973', entity: 'Peak Rescue', label: 'Level 3', rate: 45 },
  { code: '07597L', entity: 'Peak Rescue', label: 'Lead or Guiding', rate: 50 },
  // Admin is the odd one out in the handbook's own table — six digits, and it
  // belongs to no class. Kept verbatim rather than tidied into the pattern.
  { code: '007598', entity: 'Peak Rescue', label: 'Admin', rate: 40 },
  { code: '075111', entity: 'PR Service', label: 'Shadow', rate: 25 },
  { code: '075112', entity: 'PR Service', label: 'Assist / Level 1', rate: 40 },
  { code: '075113', entity: 'PR Service', label: 'Level 2', rate: 43 },
  { code: '075114', entity: 'PR Service', label: 'Level 3', rate: 45 },
  { code: '07511L', entity: 'PR Service', label: 'Lead', rate: 50 },
]

export const TRAVEL_CODE = '07597T'
// What a field day takes by default. The role on the course does not decide
// it: a lead-qualified instructor assisting is still paid the lead rate, so
// the portal's lead/assist flag must not reach this.
export const FIELD_CODE = '07597L'

export const payCode = (code: string): PayCode | undefined =>
  PAY_CODES.find((c) => c.code === code)

export const payCodeLabel = (code: string): string => {
  const c = payCode(code)
  return c ? `${c.code} — ${c.entity} ${c.label} ($${c.rate}/hr)` : code
}
