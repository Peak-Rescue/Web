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
