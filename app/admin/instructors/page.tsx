import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { InstructorTable } from './InstructorTable'

export default async function AdminInstructorsPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await createAdminClient()
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!['admin', 'instructor'].includes(profile?.role ?? '')) redirect('/dashboard')

  const admin = createAdminClient()

  const [{ data: instructors }, { data: allCapabilities }] = await Promise.all([
    admin
      .from('profiles')
      .select('id, first_name, last_name, email, phone, instructor_certs(id, cert_type, level, notes, expires_at, instructor_cert_documents(id, url, file_name))')
      .in('role', ['instructor', 'admin'])
      .order('last_name'),
    admin
      .from('instructor_capabilities')
      .select('instructor_id, category, role'),
  ])

  // Merge capabilities onto each instructor
  const capsByInstructor = new Map<string, { category: string; role: string }[]>()
  for (const cap of allCapabilities ?? []) {
    const list = capsByInstructor.get(cap.instructor_id) ?? []
    list.push({ category: cap.category, role: cap.role })
    capsByInstructor.set(cap.instructor_id, list)
  }
  const merged = (instructors ?? []).map(i => ({
    ...i,
    instructor_capabilities: capsByInstructor.get(i.id) ?? [],
  }))

  return (
    <main className="min-h-screen bg-zinc-950 text-white pt-16 md:pt-20">
      <div className="max-w-7xl mx-auto px-4 py-10">
        <h1 className="text-2xl font-bold mb-2">Instructor Certifications</h1>
        <p className="text-zinc-400 mb-8">All instructors — cert status overview</p>
        <InstructorTable instructors={merged as Parameters<typeof InstructorTable>[0]['instructors']} isAdmin={profile?.role === 'admin'} />
      </div>
    </main>
  )
}
