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
    what changed is that "first" now means in charge rather than well paid. */
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

// One word for the person running the course, used to students and to the crew
// alike. "Lead" cannot do this job any more — it is a pay band now, and a
// student reading "Lead" beside one of three lead-wage instructors learns
// nothing about who to go to.
export const DIRECTOR_LABEL = 'Course director'

/** The chip on a roster row, where the column is narrow. */
export const DIRECTOR_SHORT = 'Director'

/** What a student is told somebody is. Wage categories are ours, not theirs:
    a student has no use for the difference between an assist and a shadow, and
    "Shadow" beside somebody teaching them reads as a warning. */
export function studentFacingRole(inCharge: boolean | null | undefined): string {
  return inCharge ? DIRECTOR_LABEL : 'Instructor'
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

/** The best seat somebody could be offered: their own ceiling, not the
    course's. A lead can work an assist seat or shadow — nobody is too qualified
    to help — but an assist cannot cover a lead seat, and telling them a lead
    seat is open when they cannot take it is how somebody says yes to a week
    they were never going to be given.

    Reads the open seats in wage order, so the answer is the best one actually
    available to them rather than the best one that exists. */
export function bestOpenSeatFor(
  open: { role: InstanceRole; open: number }[],
  qualifiedToLead: boolean
): InstanceRole | null {
  const reachable = qualifiedToLead ? INSTANCE_ROLES : INSTANCE_ROLES.filter((r) => r !== 'lead')
  return reachable.find((r) => (open.find((o) => o.role === r)?.open ?? 0) > 0) ?? null
}

/** The three boxes, in wage order, as the details forms draw them. Named here so
    the form, the parser and the column names cannot fall out of step. */
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
