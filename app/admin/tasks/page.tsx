import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { loadTasksWithDocs } from '@/lib/course-tasks'
import CourseTasksPanel, { type TaskPerson } from '@/components/CourseTasksPanel'

// General tasks: the ones that belong to no course. Assigning one puts it in
// the assignee's list on the portal home, under General; this page is where
// whoever handed it out can still see it, reassign it, or take it back.
export default async function AdminTasksPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = createAdminClient()
  const [{ data: profile }, tasks, { data: peopleRows }] = await Promise.all([
    admin.from('profiles').select('role').eq('id', user.id).single(),
    loadTasksWithDocs(admin, null),
    admin.from('profiles').select('id, first_name, last_name').in('role', ['admin', 'instructor']).order('first_name'),
  ])
  if (profile?.role !== 'admin') redirect('/dashboard')

  // No course means no crew to narrow the list to: everyone is a candidate.
  const people: TaskPerson[] = (peopleRows ?? [])
    .map((p) => ({ id: p.id, name: [p.first_name, p.last_name].filter(Boolean).join(' '), onCourse: true }))
    .filter((p) => p.name)

  return (
    <main className="min-h-screen bg-zinc-950 text-white pt-16 md:pt-20">
      <div className="max-w-4xl mx-auto px-4 py-10">
        <Link href="/admin" className="text-sm text-zinc-500 hover:text-zinc-300 transition-colors mb-6 inline-block">← Portal</Link>
        <h1 className="text-2xl font-bold mb-8">Tasks</h1>
        <CourseTasksPanel
          instanceId={null}
          tasks={tasks}
          people={people}
          canManage
          currentUserId={user.id}
        />
      </div>
    </main>
  )
}
