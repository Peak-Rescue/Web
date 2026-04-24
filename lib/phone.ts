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
