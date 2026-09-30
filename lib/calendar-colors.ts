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
} as const

export type Sector = keyof typeof CATEGORY_STYLE

export type CalendarSubject = {
  category?: string | null
  internal?: boolean | null
  client?: string | null
}

/**
 * Every course has a category, internal ones included — it is required at the
 * top of the new-course form and the column is not null. So the sector is a
 * fact about the discipline alone, and internal never overrides it: a CE day
 * on rope rescue is a tactical day, and a calendar that said otherwise would
 * hide it from anyone filtering to the sector whose instructors it occupies.
 */
export function sectorOf(c: CalendarSubject): Sector {
  return c.category === 'tactical' ? 'military' : 'civilian'
}

/**
 * No client of any kind: instructor development, CE, a planning day — work we
 * lay on for ourselves. A consultation has no students but is still that
 * client's job, so the client is what this is about.
 *
 * It rides on top of the sector colour rather than replacing it, because the
 * two answer different questions: the colour says which sector's work a day
 * is, this says whether it earns. Both stay true of the same chip.
 */
export function isOurs(c: CalendarSubject): boolean {
  return Boolean(c.internal) && !c.client
}

/**
 * The internal marker: a faint hatch across the whole bar (defined in
 * globals.css). Texture rather than an edge, because the edges are spoken for
 * — the border carries status, dashed is tentative — and because a mark that
 * covers the bar grows with it: a week-long CE block is exactly the one worth
 * noticing when hunting for a free weekend, and the leading stripe this
 * replaces was 3px of signal against the whole length of that bar.
 */
export const OURS_MARK = 'ours-hatch'
