// What somebody is on a course, and who is running it — two questions, and for
// a long time one column.
//
// `instance_instructors.role` answers the first: what we pay them. Three
// categories, and each is a wage — a lead hour, an assist hour and a shadow
// hour are three numbers in the rate library, and how a person is staffed is
// what picks theirs. It says nothing about authority.
//
// `in_charge` answers the second, and any number of the crew can be. A course
// can carry three people on lead wage with one of them running it that week,
// and it can hand a course to a strong assist without pretending to pay them
// more. Everything that gates a course's tasks, decides a course is ready to
// run, or tells a student who to go to reads that flag and never the wage.
//
// Not to be confused with `capability_role` ('lead' | 'assistant'), which is
// what somebody is *qualified* for across a discipline — a standing fact about
// a person, where these two are facts about one course.

/** Wage categories, highest first. Order is the display order everywhere. */
export const INSTANCE_ROLES = ['lead', 'assist', 'shadow'] as const

export type InstanceRole = (typeof INSTANCE_ROLES)[number]

const ROLE_LABELS: Record<InstanceRole, string> = {
  lead: 'Lead',
  assist: 'Assist',
  shadow: 'Shadow',
}

/** What the crew list calls each category. Falls back to the stored string so
    a value added to the enum ahead of this file still reads as itself rather
    than as nothing. */
export function roleLabel(role: string | null | undefined): string {
  return role ? ROLE_LABELS[role as InstanceRole] ?? role : ''
}

export function isInstanceRole(v: unknown): v is InstanceRole {
  return typeof v === 'string' && (INSTANCE_ROLES as readonly string[]).includes(v)
}

/** A stored role, or 'assist' — the column's own default, and the safe guess:
    it neither hands out lead wage nor quietly halves somebody's rate. */
export function asInstanceRole(v: unknown): InstanceRole {
  return isInstanceRole(v) ? v : 'assist'
}

const RANK: Record<InstanceRole, number> = { lead: 0, assist: 1, shadow: 2 }

/** Crew order: whoever is running the course, then by wage, then by name.
    The team's calendar-event convention put leads first and this keeps it —
    what changed is that "first" now means primary rather than well paid. */
export function crewOrder(
  a: { role?: string | null; in_charge?: boolean | null; name?: string | null },
  b: { role?: string | null; in_charge?: boolean | null; name?: string | null }
): number {
  return (
    Number(Boolean(b.in_charge)) - Number(Boolean(a.in_charge)) ||
    RANK[asInstanceRole(a.role)] - RANK[asInstanceRole(b.role)] ||
    (a.name ?? '').localeCompare(b.name ?? '')
  )
}

// The team's word for whoever is running the course: primary. There can be
// more than one on a week, which is the whole reason it could not go on being
// called the lead — that is a pay band now, and a student reading "Lead" beside
// one of three lead-wage instructors learns nothing about who to go to.
//
// The column behind it is still `in_charge`. Renaming a column buys nothing a
// comment cannot, and costs a window where the deployed code and the database
// disagree about what it is called.
export const PRIMARY_LABEL = 'Primary'

/** What a student is told somebody is. "Primary" alone is the crew's shorthand
    and means nothing to a student, so they get the noun with it.

    Wage categories never reach them: a student has no use for the difference
    between an assist and a shadow, and "Shadow" beside somebody teaching them
    reads as a warning about the person. */
export function studentFacingRole(inCharge: boolean | null | undefined): string {
  return inCharge ? 'Primary instructor' : 'Instructor'
}

// ─── The crew plan ──────────────────────────────────────────────────────────
// How many of each category a course is planned to run. Its own shape because
// three columns, a total, and the arithmetic that keeps them honest were about
// to be written out in the two forms that edit it, the two actions that save it,
// the call-out page that offers the seats and the panel that fills them.

export type CrewPlan = {
  lead: number | null
  assist: number | null
  shadow: number | null
}

export const EMPTY_CREW_PLAN: CrewPlan = { lead: null, assist: null, shadow: null }

/** Whether anybody has actually broken the crew down. A plan of all-nulls is a
    course nobody has thought about that way yet, and it must not be shown as a
    crew of zero — an empty plan and a plan for nobody are different answers. */
export function hasCrewPlan(plan: CrewPlan): boolean {
  return plan.lead !== null || plan.assist !== null || plan.shadow !== null
}

/** How many people the plan comes to, or null when there is no plan. The number
    the estimate quotes for and staffing counts against — derived, never typed,
    so the parts and the total cannot disagree. */
export function crewPlanTotal(plan: CrewPlan): number | null {
  if (!hasCrewPlan(plan)) return null
  return (plan.lead ?? 0) + (plan.assist ?? 0) + (plan.shadow ?? 0)
}

/** The plan as seats, biggest category first, skipping ones with no seats. What
    a call-out and a crew list say out loud. */
export function crewPlanSeats(plan: CrewPlan): { role: InstanceRole; seats: number }[] {
  return INSTANCE_ROLES.map((role) => ({ role, seats: plan[role] ?? 0 }))
    .filter((s) => s.seats > 0)
}

/** "2 lead · 1 assist". Empty string when there is no plan, so a caller can
    fall back to the head count rather than print a blank. */
export function crewPlanSummary(plan: CrewPlan): string {
  return crewPlanSeats(plan)
    .map((s) => `${s.seats} ${roleLabel(s.role).toLowerCase()}`)
    .join(' · ')
}

/** What is still open, category by category, against who is already staffed.
    Worked out at read time and never stored: a seat is open or not depending on
    who has been assigned this minute, which is exactly the fact an emailed
    number cannot tell the truth about. */
export function openSeats(
  plan: CrewPlan,
  crew: { role?: string | null }[]
): { role: InstanceRole; seats: number; filled: number; open: number }[] {
  return crewPlanSeats(plan).map((s) => {
    const filled = crew.filter((c) => asInstanceRole(c.role) === s.role).length
    return { ...s, filled, open: Math.max(s.seats - filled, 0) }
  })
}


/** The three boxes, in wage order, as the details forms draw them. Named here so
    the form, the parser and the column names cannot fall out of step. */
/** Every seat this person could hold, best first — their ceiling, not the
    course's. A lead can work an assist seat or shadow; nobody is too qualified
    to help. An assist cannot cover a lead seat, so they are never shown a lead
    tick-box to put their name against.

    This is the whole answer now. There used to be a companion that picked the
    single best *open* seat, for a greeting that told somebody which seat they
    would be put in — and that greeting was the last place the page still spoke
    as though the seat were ours to assign rather than theirs to accept. */
export function reachableSeats(qualifiedToLead: boolean): InstanceRole[] {
  return qualifiedToLead ? [...INSTANCE_ROLES] : INSTANCE_ROLES.filter((r) => r !== 'lead')
}

export const CREW_SEAT_FIELDS = [
  { role: 'lead' as InstanceRole, name: 'lead_slots', key: 'lead_slots', label: 'Lead' },
  { role: 'assist' as InstanceRole, name: 'assist_slots', key: 'assist_slots', label: 'Assist' },
  { role: 'shadow' as InstanceRole, name: 'shadow_slots', key: 'shadow_slots', label: 'Shadow' },
] as const

/** A course row's three columns as a plan. */
export function crewPlanOf(course: {
  lead_slots?: number | null
  assist_slots?: number | null
  shadow_slots?: number | null
}): CrewPlan {
  return {
    lead: course.lead_slots ?? null,
    assist: course.assist_slots ?? null,
    shadow: course.shadow_slots ?? null,
  }
}

// ─── How a wage band looks ───────────────────────────────────────────────────
// A colour per band, defined once, because the same three words appear on the
// crew row, the roster card, the dashboard, the call-out and the rate library,
// and three screens each picking their own blue is how a colour stops meaning
// anything.
//
// Which colours were available is most of the answer. Teal is spoken for — it
// means "primary", the person answering for the course, and it has meant
// roughly that to everyone reading these screens for a long time. Amber means
// something needs doing. Red is the brand and destruction. So the bands take
// violet and sky, which are far enough apart to tell at ten pixels (indigo
// beside blue is not), and shadow takes zinc on purpose: it is the quietest
// badge because it is the most junior seat, and a third bright colour would
// give a trainee the same visual weight as the person running the week.
export const ROLE_BADGE: Record<InstanceRole, string> = {
  lead: 'bg-violet-500/10 border-violet-500/30 text-violet-300',
  assist: 'bg-sky-500/10 border-sky-500/30 text-sky-300',
  shadow: 'bg-zinc-500/10 border-zinc-600/40 text-zinc-400',
}

/** Just the text colour, for places already inside a border — a select, a
    label, a line in a list. */
export const ROLE_TEXT: Record<InstanceRole, string> = {
  lead: 'text-violet-300',
  assist: 'text-sky-300',
  shadow: 'text-zinc-400',
}

/** The pill's own classes, band colour included. One string so a caller cannot
    get the shape right and the colour wrong. */
export function roleBadgeClass(role: string | null | undefined): string {
  return `shrink-0 px-1.5 py-px rounded border text-[10px] font-semibold uppercase tracking-wide ${
    ROLE_BADGE[asInstanceRole(role)]
  }`
}

// The same three words appear on a second axis: `instructor_capabilities.role`,
// what somebody is signed off to do across a discipline. A standing fact about a
// person rather than a fact about one course — but it is the same vocabulary, so
// it wears the same colours. A lead looks like a lead on their profile, on the
// expertise grid and on a course crew row, and the axis is told apart by what is
// around it, not by inventing a second palette for the same word.
//
// Capabilities have no shadow, and should not: shadowing is what somebody does
// before they are signed off for anything, so there is nothing to record.
//
// This is also what freed teal. It used to mean "qualified to lead" on the
// instructor table and "primary" on a course, which are not the same claim and
// were the same colour.

/** Filled, for a toggle that is on — an expertise button, a picked capability.
    A translucent pill does not read as pressed. */
export const ROLE_SOLID: Record<InstanceRole, string> = {
  lead: 'bg-violet-700 text-white',
  assist: 'bg-sky-700 text-white',
  shadow: 'bg-zinc-600 text-white',
}

/** Dimmer than solid, brighter than nothing: a value that is set but is not the
    thing you are pointing at. */
export const ROLE_MUTED: Record<InstanceRole, string> = {
  lead: 'bg-violet-900/60 text-violet-300',
  assist: 'bg-sky-900/60 text-sky-300',
  shadow: 'bg-zinc-800 text-zinc-400',
}

/** A bare dot, where a whole word will not fit — the capability column in a
    dense table. Never the only channel: it carries a title with the word in it. */
export const ROLE_DOT: Record<InstanceRole, string> = {
  lead: 'bg-violet-500',
  assist: 'bg-sky-500',
  shadow: 'bg-zinc-500',
}

/** One letter, for a cell two characters wide. */
export function roleInitial(role: string | null | undefined): string {
  return roleLabel(role).slice(0, 1).toUpperCase()
}
