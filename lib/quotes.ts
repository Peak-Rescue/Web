// Quote boilerplate — the recurring copy from Peak Rescue's real quotes,
// templated verbatim (typos fixed, branding standardized).

export const QUOTE_MISSION =
  "Peak Rescue's mission is to provide each client or organization with cutting edge skills and education to " +
  'prevent catastrophe. We also respond to difficult rescue scenarios with the safest and most effective ' +
  'techniques available to rescuers.'

export const QUOTE_COMMITMENT =
  'We truly look forward to this opportunity! We stand behind our mission to be the top training team for ' +
  'mountain warfare operations. We are committed to giving you the best training; specially designed for YOU ' +
  'and your team! Your teams are the heart of our company and we value your experience with Peak Rescue! ' +
  'Looking forward to working with you!'

export const QUOTE_CONTACT = {
  phone: '(833) 737-2834',
  website: 'www.peakrescuemountainguides.com',
}

export function quoteNumber(refNumber: number, seq: number): string {
  return `PR-${String(refNumber).padStart(4, '0')}-Q${seq}`
}

export const QUOTE_VALIDITY_DAYS = 30
