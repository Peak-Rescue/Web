import { type createAdminClient } from '@/lib/supabase/admin'

// Who is driving a course.
//
// Not the crew — the admin whose job it is to move it down the pipeline: get
// it staffed, get the quote out, get it billed, close its books. A course with
// nobody's name on it is the one that stalls, because everybody assumes
// somebody else is driving it.
//
// The face is the instructor photo, not the profile's OAuth picture: every
// admin here is also on the roster, the roster photo is the one somebody
// chose and framed, and using it means the pill on the list and the card on
// the course show the same person the same way.

export type CourseOwner = {
  id: string
  name: string
  /** Two letters, for whoever has no photo. */
  initials: string
  avatar: string | null
  avatarPosition: string | null
  avatarScale: number | null
}

export const initialsOf = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase() || '?'

type Row = {
  id: string
  first_name: string | null
  last_name: string | null
  email: string | null
  instructors: { avatar: string | null; avatar_position: string | null; avatar_scale: number | string | null }[] | null
}

/** Everyone who could own a course. Admins only: owning one means being able
    to do every step on it, and the list's whole promise is that the name on a
    row is somebody who can act. */
export async function loadCourseOwners(
  admin: ReturnType<typeof createAdminClient>
): Promise<CourseOwner[]> {
  const { data } = await admin
    .from('profiles')
    .select('id, first_name, last_name, email, instructors(avatar, avatar_position, avatar_scale)')
    .eq('role', 'admin')
    .order('first_name')

  return ((data ?? []) as unknown as Row[]).map((p) => {
    const name = [p.first_name, p.last_name].filter(Boolean).join(' ').trim() || p.email || 'Admin'
    const roster = p.instructors?.[0]
    return {
      id: p.id,
      name,
      initials: initialsOf(name),
      avatar: roster?.avatar ?? null,
      avatarPosition: roster?.avatar_position ?? null,
      avatarScale: roster?.avatar_scale === null || roster?.avatar_scale === undefined ? null : Number(roster.avatar_scale),
    }
  })
}
