import { createAdminClient } from '@/lib/supabase/admin'
import { removeEnrollment } from './actions'
import StudentInvitePanel from './StudentInvitePanel'
import ViewSharePanel from './ViewSharePanel'

// The roster, the invite link that fills it, and the read-only links shared
// with people who have no account.
//
// Loads its own enrollments and shares rather than being handed them: the
// course page already reads the roster for its own display, but in a different
// shape, and two mappings of one query is how they drift.
//
// A server component, because removing someone is a server action bound to a
// row.
export default async function CourseStudentsEditor({
  instanceId,
  maxStudents,
  inviteToken,
  inviteExpiresAt,
}: {
  instanceId: string
  maxStudents: number | null
  inviteToken: string | null
  inviteExpiresAt: string | null
}) {
  const admin = createAdminClient()
  const [{ data: enrollmentRows }, { data: shareRows }] = await Promise.all([
    admin.from('enrollments')
      .select('id, enrolled_at, profiles(first_name, last_name, email)')
      .eq('instance_id', instanceId).order('enrolled_at'),
    admin.from('course_view_shares')
      .select('id, token, label, created_at, last_viewed_at')
      .eq('instance_id', instanceId).order('created_at'),
  ])
  const enrollments = enrollmentRows ?? []

  return (
    <div>
      {enrollments.length > 0 && (
        <div className="mb-4 space-y-2">
          {enrollments.map((e) => {
            const p = e.profiles as unknown as { first_name: string | null; last_name: string | null; email: string | null } | null
            const name = [p?.first_name, p?.last_name].filter(Boolean).join(' ') || 'Unnamed'
            const removeWithArgs = removeEnrollment.bind(null, instanceId, e.id)
            return (
              <div key={e.id} className="flex items-center justify-between px-4 py-2 bg-zinc-900 border border-zinc-800 rounded-lg">
                <div>
                  <span className="font-medium text-sm">{name}</span>
                  {p?.email && <span className="ml-3 text-xs text-zinc-500">{p.email}</span>}
                </div>
                <form action={removeWithArgs}>
                  <button type="submit" className="text-xs text-zinc-500 hover:text-red-400 transition-colors">Remove</button>
                </form>
              </div>
            )
          })}
        </div>
      )}

      <StudentInvitePanel
        instanceId={instanceId}
        inviteUrl={inviteToken ? `${process.env.NEXT_PUBLIC_SITE_URL}/join/${inviteToken}` : null}
        expiresAt={inviteExpiresAt}
        expired={!!inviteExpiresAt && new Date(inviteExpiresAt) < new Date()}
      />

      <ViewSharePanel
        instanceId={instanceId}
        shares={(shareRows ?? []) as unknown as React.ComponentProps<typeof ViewSharePanel>['shares']}
      />

      {maxStudents !== null && enrollments.length > maxStudents && (
        <p className="mt-3 text-xs text-amber-400">
          {enrollments.length} enrolled against {maxStudents} places.
        </p>
      )}
    </div>
  )
}
