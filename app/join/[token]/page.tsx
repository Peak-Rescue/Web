import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { courseDisplayName } from '@/lib/courses'
import JoinForm from './JoinForm'
import JoinAsSelf from './JoinAsSelf'

export const metadata = { robots: { index: false } }

function fmt(d: string) {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
}

function Notice({ title, body }: { title: string; body: string }) {
  return (
    <main className="min-h-screen flex items-center justify-center bg-zinc-950 pt-16 md:pt-20">
      <div className="max-w-md w-full mx-4 text-center">
        <h1 className="text-2xl font-bold text-white mb-4">{title}</h1>
        <p className="text-zinc-400">{body}</p>
      </div>
    </main>
  )
}

export default async function JoinPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params

  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(token)) {
    return <Notice title="Invalid invite link" body="This link is not a valid course invite. Check with your course organizer for the correct link." />
  }

  const admin = createAdminClient()
  const { data: inst } = await admin
    .from('course_instances')
    .select('id, course_type, custom_title, starts_at, ends_at, location, client_name, max_students, invite_expires_at')
    .eq('invite_token', token)
    .maybeSingle()

  if (!inst) {
    return <Notice title="Invalid invite link" body="This invite link is not valid. It may have been revoked — check with your course organizer." />
  }
  if (inst.invite_expires_at && new Date(inst.invite_expires_at).getTime() < Date.now()) {
    return <Notice title="Invite link expired" body="This invite link has expired. Contact your course organizer for a new one." />
  }

  if (inst.max_students) {
    const { count } = await admin
      .from('enrollments')
      .select('id', { count: 'exact', head: true })
      .eq('instance_id', inst.id)
    if ((count ?? 0) >= inst.max_students) {
      return <Notice title="Course is full" body="All seats for this course are taken. Contact your course organizer." />
    }
  }

  // A student who is still signed in from a previous course never has to type
  // anything, or wait on an email, to take the next one.
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const name = courseDisplayName(inst.course_type, inst.custom_title)
  const dates = inst.starts_at
    ? inst.ends_at && inst.ends_at !== inst.starts_at
      ? `${fmt(inst.starts_at)} – ${fmt(inst.ends_at)}`
      : fmt(inst.starts_at)
    : null

  return (
    <main className="min-h-screen flex items-center justify-center bg-zinc-950 pt-16 md:pt-20">
      <div className="max-w-md w-full mx-4 py-12">
        <div className="mb-8 text-center">
          <p className="text-sm text-zinc-400 mb-1">You&rsquo;re invited to join</p>
          <h1 className="text-2xl font-bold text-white">{name}</h1>
          <p className="mt-2 text-sm text-zinc-400">
            {[dates, inst.location].filter(Boolean).join(' · ')}
          </p>
        </div>
        {user?.email
          ? <JoinAsSelf token={token} email={user.email} />
          : <JoinForm token={token} />}
      </div>
    </main>
  )
}
