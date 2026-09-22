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

// A phone field somebody typed into free text, split into the pieces a dialer
// can use and the pieces it cannot. Those fields hold things like "Office:
// 757-421-1662", "Direct: 307.687.8452 | Cell: 307-689-9997", and "signal
// only" — and a dialer handed a tel: with letters in it spells them out on
// the keypad, so "Office:" would dial 633423 in front of the real number.
//
// Every number in the string gets its own href; the labels and separators
// come back as text with none, so what you read is still what was typed.
export function phoneParts(raw: string | null | undefined): { text: string; href: string | null }[] {
  if (!raw) return []
  // Split on what separates one number from the next, or a number from its
  // extension — keeping the separators, since they are part of what was
  // written. Without this the digits either side would run into one number.
  return raw
    .split(/(\s*[|/;,]\s*|\s+or\s+|\s*\b(?:x|ext\.?)\b\s*)/i)
    .map((text, i) => ({ text, href: i % 2 === 0 ? dialable(text) : null }))
    .filter((p) => p.text)
}

/** The tel: for a single number, or null when there is nothing to dial. */
function dialable(piece: string): string | null {
  const plus = /\+\s*\d/.test(piece)
  const digits = piece.replace(/\D/g, '')
  if (digits.length < 7) return null
  if (plus) return `tel:+${digits}`
  const core = digits.length === 11 && digits[0] === '1' ? digits.slice(1) : digits
  return core.length === 10 ? `tel:+1${core}` : `tel:${digits}`
}
