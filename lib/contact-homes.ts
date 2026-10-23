// Where a person can be known from, as a key.
//
// Not in the actions file: that is a `'use server'` module, and everything a
// server module exports has to be an async function — a helper exported from
// it compiles and then fails at runtime, which is the worst of both.

export type ContactScope =
  | { clientId: string }
  | { venueId: string }
  | { regionCode: string }

/** `client:<id>`, `venue:<id>` or `region:<code>`. A key rather than a scope
    object because it is a checkbox's value and a map's key long before it is
    ever a write. */
export type ContactHome = { key: string; label: string }

export const keyOf = (scope: ContactScope): string =>
  'clientId' in scope ? `client:${scope.clientId}`
  : 'venueId' in scope ? `venue:${scope.venueId}`
  : `region:${scope.regionCode}`

export const scopeOf = (key: string): ContactScope | null => {
  const i = key.indexOf(':')
  if (i === -1) return null
  const level = key.slice(0, i)
  const id = key.slice(i + 1)
  if (!id) return null
  if (level === 'client') return { clientId: id }
  if (level === 'venue') return { venueId: id }
  if (level === 'region') return { regionCode: id }
  return null
}
