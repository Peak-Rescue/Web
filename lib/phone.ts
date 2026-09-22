/** Strip to digits only (drop leading +). */
export function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  // Drop leading country code 1 for US numbers (11 digits starting with 1)
  const core = digits.length === 11 && digits[0] === '1' ? digits.slice(1) : digits
  if (core.length === 10) return `+1${core}`
  // Non-US or partial — store cleaned but don't mangle
  return raw.trim()
}

/** Format for display: +15551234567 → (555) 123-4567 */
export function formatPhone(raw: string | null | undefined): string {
  if (!raw) return ''
  const digits = raw.replace(/\D/g, '')
  const core = digits.length === 11 && digits[0] === '1' ? digits.slice(1) : digits
  if (core.length === 10) {
    return `(${core.slice(0, 3)}) ${core.slice(3, 6)}-${core.slice(6)}`
  }
  return raw
}

// A dialable href for a number somebody typed into a free-text field. Those
// fields hold things like "Office: 757-421-1662", "Direct: 307.687.8452 |
// Cell: 307-689-9997", and "signal only" — and a dialer given a tel: with
// letters in it spells them out on the keypad, so "Office:" dials 633423
// in front of the real number. Take the first number in the string and drop
// everything else; the label stays in the text you can read.
//
// Returns null when there is no number to call, so the caller can render
// plain text rather than a link that goes nowhere.
export function phoneHref(raw: string | null | undefined): string | null {
  if (!raw) return null
  // Stop at whatever separates a first number from a second one, or from an
  // extension — both would otherwise merge into one long wrong number.
  const first = raw.split(/[|/,;]|\bx\b|\bext\b|\bor\b/i)[0]
  const plus = /\+\s*\d/.test(first)
  const digits = first.replace(/\D/g, '')
  if (digits.length < 7) return null
  if (plus) return `tel:+${digits}`
  const core = digits.length === 11 && digits[0] === '1' ? digits.slice(1) : digits
  return core.length === 10 ? `tel:+1${core}` : `tel:${digits}`
}
