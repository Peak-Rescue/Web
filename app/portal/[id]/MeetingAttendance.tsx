import { createAdminClient } from '@/lib/supabase/admin'
import { loadAttendance, rosterIdFor } from '@/lib/meetings'
import MeetingRsvp from '@/components/MeetingRsvp'

// Who is coming to a meeting, and the viewer's own answer. Loads on its own
// rather than joining the course page's batches: only a meeting draws it, and
// nothing else on the page wants these rows.
export default async function MeetingAttendance({
  instanceId,
  allStaff,
  userId,
}: {
  instanceId: string
  allStaff: boolean
  userId: string | null
}) {
  const admin = createAdminClient()
  const rosterId = userId ? await rosterIdFor(admin, userId) : null
  const a = await loadAttendance(admin, { id: instanceId, all_staff: allStaff }, rosterId)

  return (
    <div className="space-y-2">
      {rosterId && <MeetingRsvp instanceId={instanceId} mine={a.mine} />}
      <p className="text-sm text-zinc-400">
        <span className="text-zinc-200">{a.going.length} going</span>
        {a.going.length > 0 && <span>: {a.going.join(', ')}</span>}
        {a.notGoing.length > 0 && <span> · {a.notGoing.length} can’t make it: {a.notGoing.join(', ')}</span>}
        {a.unanswered > 0 && <span> · {a.unanswered} not answered</span>}
      </p>
    </div>
  )
}
