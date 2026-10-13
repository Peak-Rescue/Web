import { createAdminClient } from '@/lib/supabase/admin'
import MeetingInvites from './MeetingInvites'

// The invite list's own two reads, kept out of the course page's batches: it
// is drawn for an admin, on a meeting, that is not open to all staff, and
// nothing else on the page wants either answer.
export default async function MeetingInviteSection({ instanceId }: { instanceId: string }) {
  const admin = createAdminClient()
  const [{ data: people }, { data: rows }] = await Promise.all([
    admin.from('instructors').select('id, name').eq('active', true).order('name'),
    admin.from('meeting_invites').select('instructor_id').eq('instance_id', instanceId),
  ])
  return (
    <MeetingInvites
      instanceId={instanceId}
      people={(people ?? []) as { id: string; name: string }[]}
      invited={(rows ?? []).map((r) => r.instructor_id as string)}
    />
  )
}
