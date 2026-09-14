// One palette for both calendars: the month grid on the portal and the date
// painter's overlay of what is already booked. Two drawings of the same fact
// have to agree on colour, or the colour stops meaning anything.
//
// Chips are coloured by designation like the Google calendars — military vs
// civilian, same rule as the sync (course_category 'tactical' → military,
// everything else → civilian).
export const CATEGORY_STYLE = {
  military: {
    swatch: 'bg-orange-900 border-orange-700 text-orange-100',
    solid: 'bg-orange-900/80 text-orange-100 border-orange-700',
    outline: 'border-orange-700 text-orange-300',
    bar: 'bg-orange-700',
  },
  civilian: {
    swatch: 'bg-cyan-900 border-cyan-700 text-cyan-100',
    solid: 'bg-cyan-900/80 text-cyan-100 border-cyan-700',
    outline: 'border-cyan-700 text-cyan-300',
    bar: 'bg-cyan-700',
  },
  // Work of ours with no client belongs to neither sector and syncs to the
  // admin calendar rather than the military or civilian one — so it reads as
  // neither colour here either. A client job with no students keeps its
  // sector; the client is what the colour is about.
  ours: {
    swatch: 'bg-zinc-700 border-zinc-500 text-zinc-100',
    solid: 'bg-zinc-700/80 text-zinc-100 border-zinc-500',
    outline: 'border-zinc-500 text-zinc-300',
    bar: 'bg-zinc-500',
  },
} as const

export type Sector = keyof typeof CATEGORY_STYLE

/** No client of any kind — see CATEGORY_STYLE.ours. */
export function sectorOf(c: { category?: string | null; internal?: boolean | null; client?: string | null }): Sector {
  if (c.internal && !c.client) return 'ours'
  return c.category === 'tactical' ? 'military' : 'civilian'
}
