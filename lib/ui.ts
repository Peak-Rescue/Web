// The three weights an action can have, and one card to put them on.
//
// Written down because the pricing page had grown eight button styles for
// what are really three kinds of act, and nothing about a button's look told
// you which kind it was: "Mark sent" and "Send the quote to the client" were
// the same size and nearly the same colour, and one of them emails a client.
//
// Three tiers, and the test for which is what happens when you press it:
//
//   primary   — it leaves the building. A quote to a client, a request to
//               Harken, a course's numbers to somebody outside. Red, because
//               there is no undo on a sent email.
//   secondary — ordinary work that stays inside: add a line, mark something,
//               make a draft. Bordered, quiet, the default for everything.
//   quiet     — destructive or rare, and never the thing you came here to do:
//               delete, set aside, withdraw. Text only, red on hover.
//
// Two sizes: `.lg` for an action that belongs to a whole section, and the
// base for one that belongs to a row. Nothing else. A third size is how the
// eight started.
//
// These are strings rather than components on purpose — every button here is
// a plain <button> with its own handler, and wrapping them would mean
// threading disabled, type, title and form semantics through a component for
// the sake of a class name. This is a portal-wide convention being written
// down in one place, not a design system; a proper one is a job of its own.

const base = 'rounded font-medium transition-colors disabled:opacity-50'

export const btn = {
  /** It leaves the building. */
  primary: `${base} px-2.5 py-1.5 text-xs bg-pr-red/90 hover:bg-pr-red text-white`,
  primaryLg: `${base} px-3 py-2 text-sm bg-pr-red/90 hover:bg-pr-red text-white`,

  /** Ordinary work that stays inside. */
  secondary: `${base} px-2.5 py-1.5 text-xs border border-zinc-700 text-zinc-300 hover:text-white hover:border-zinc-500 hover:bg-zinc-800`,
  secondaryLg: `${base} px-3 py-2 text-sm border border-zinc-700 bg-zinc-800 text-zinc-200 hover:bg-zinc-700`,

  /** Agreement reached — accepted, approved. Its own colour because it is a
      state worth spotting across a page, not a louder secondary. */
  agree: `${base} px-2.5 py-1.5 text-xs bg-teal-800 hover:bg-teal-700 text-white`,
  agreeLg: `${base} px-3 py-2 text-sm bg-teal-800 hover:bg-teal-700 text-white`,

  /** Destructive or rare, and never the thing you came here to do. */
  quiet: 'text-xs text-zinc-600 hover:text-zinc-300 transition-colors disabled:opacity-50',
  danger: 'text-xs text-zinc-600 hover:text-pr-red-light transition-colors disabled:opacity-50',
} as const

/** One box for a thing in a list: a quote, a request, a COA. */
export const card = 'border border-zinc-800 rounded-lg bg-zinc-900'

/** A section's name inside a fold — quieter than the fold's own title, and
    identical everywhere, because a heading's job is to say where you are
    rather than to compete with the one above it. */
export const sectionTitle = 'text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500'

/** What separates one section from the next. */
export const sectionRule = 'pt-6 border-t border-zinc-800'
