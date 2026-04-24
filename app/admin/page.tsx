import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import Link from 'next/link'

export default async function AdminPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await createAdminClient()
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'admin') redirect('/dashboard')

  return (
    <main className="min-h-screen bg-zinc-950 text-white pt-16 md:pt-20">
      <div className="max-w-4xl mx-auto px-4 py-10">
        <h1 className="text-2xl font-bold mb-8">Admin</h1>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Link
            href="/admin/instructors"
            className="p-6 rounded-lg bg-zinc-900 border border-zinc-800 hover:border-pr-red transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="mb-3 text-pr-red">
              <circle cx="4" cy="7" r="2"/><path d="M1 21v-1a3 3 0 0 1 6 0v1"/>
              <circle cx="12" cy="7" r="2"/><path d="M9 21v-1a3 3 0 0 1 6 0v1"/>
              <circle cx="20" cy="7" r="2"/><path d="M17 21v-1a3 3 0 0 1 6 0v1"/>
            </svg>
            <h2 className="font-semibold text-lg mb-1">Instructor Certifications</h2>
            <p className="text-zinc-400 text-sm">View all instructor cert status for staffing</p>
          </Link>
          <Link
            href="/instructor"
            className="p-6 rounded-lg bg-zinc-900 border border-zinc-800 hover:border-pr-red transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="mb-3 text-pr-red">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
            </svg>
            <h2 className="font-semibold text-lg mb-1">My Certifications</h2>
            <p className="text-zinc-400 text-sm">Manage your own certs and profile</p>
          </Link>
        </div>
      </div>
    </main>
  )
}
