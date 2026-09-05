// Who has seen what was sent to a course.
//
// One question, asked two ways. Of yourself: is there something behind this
// door I have not seen? Of somebody else: if they opened the course right now,
// would they land on a dot? Same rule both times, which is the point — the
// mark on a student's card is not a second feature, it is this question asked
// about them.

export type Push = {
  /** Which door it is behind, as the course page groups them. */
  section: string
  /** 'everyone' | 'students' | 'instructors' */
  audience: string
  /** Null for a send with no signed-in author. */
  pushed_by: string | null
  pushed_at: string
}

export type Reader = {
  /** Null before their first visit, and then nothing is news: a dot on a page
      somebody has never opened is telling them they are behind on all of it. */
  lastSeenAt: string | null
  /** Their own send is not news to them — they were there when it went. */
  userId: string | null
  /** Students and staff get different halves of a course's post. */
  isStudent: boolean
}

/** Whether a notice sent to `audience` reaches this reader at all. */
export function reaches(audience: string, isStudent: boolean): boolean {
  if (audience === 'everyone') return true
  return isStudent ? audience === 'students' : audience === 'instructors'
}

/** The doors with something behind them, for one reader. */
export function unseenSections(pushes: Push[], reader: Reader): Set<string> {
  const { lastSeenAt, userId, isStudent } = reader
  if (!lastSeenAt) return new Set()
  return new Set(
    pushes
      .filter((p) => p.pushed_at > lastSeenAt)
      .filter((p) => !userId || p.pushed_by !== userId)
      .filter((p) => reaches(p.audience, isStudent))
      .map((p) => p.section)
  )
}

/**
 * When the last thing that reaches students went out, or null if nothing has.
 * The roster measures against this rather than against each person's own last
 * notice: what a course wants to know is who is behind on the current plan.
 */
export function lastPushToStudents(pushes: Push[]): string | null {
  return pushes
    .filter((p) => reaches(p.audience, true))
    .map((p) => p.pushed_at)
    .sort()
    .at(-1) ?? null
}

/**
 * Whether somebody would land on a dot if they opened the course now.
 *
 * Never seen it counts as behind — unlike a reader's own dot, where a first
 * visit is not "everything is new". The difference is what each is for: one
 * says "there is something here you have not read", which is meaningless
 * before you have read anything; the other says "we told them and they have
 * not looked", which is exactly true of somebody who has never looked.
 */
export function behindOnPush(lastSeenAt: string | null | undefined, lastPush: string | null): boolean {
  if (!lastPush) return false
  return !lastSeenAt || lastSeenAt < lastPush
}
