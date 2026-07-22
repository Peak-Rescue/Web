// Supabase auth stores emails lowercased, so anything we match against
// auth emails must be normalized the same way on save.
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

// Escape LIKE wildcards so .ilike() behaves as case-insensitive equality
// (emails may legitimately contain underscores).
export function ilikeExact(value: string): string {
  return value.replace(/[\\%_]/g, '\\$&')
}
