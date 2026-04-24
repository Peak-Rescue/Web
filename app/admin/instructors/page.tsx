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

  const { data: instructors } = await createAdminClient()
    .from('profiles')
    .select('id, first_name, last_name, email, phone, instructor_certs(id, cert_type, level, notes, expires_at, instructor_cert_documents(id, url, file_name))')
    .in('role', ['instructor', 'admin'])
    .order('last_name')

  return (
    <main className="min-h-screen bg-zinc-950 text-white pt-16 md:pt-20">
      <div className="max-w-7xl mx-auto px-4 py-10">
        <h1 className="text-2xl font-bold mb-2">Instructor Certifications</h1>
        <p className="text-zinc-400 mb-8">All instructors — cert status overview</p>
        <InstructorTable instructors={(instructors ?? []) as Parameters<typeof InstructorTable>[0]['instructors']} isAdmin={profile?.role === 'admin'} />
      </div>
    </main>
  )
}
