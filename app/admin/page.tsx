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
    .select('role, first_name, last_name, email')
    .eq('id', user.id)
    .single()

  if (!['admin', 'instructor'].includes(profile?.role ?? '')) redirect('/dashboard')

  const isAdmin = profile?.role === 'admin'
  const displayName = [profile?.first_name, profile?.last_name].filter(Boolean).join(' ').trim()
    || profile?.email
    || user.email

  return (
    <main className="min-h-screen bg-zinc-950 text-white pt-16 md:pt-20">
      <div className="max-w-4xl mx-auto px-4 py-10">
        <div className="mb-8 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold">Portal</h1>
          <span
            className={`px-2.5 py-1 rounded-full text-xs font-semibold uppercase tracking-wider border ${
              isAdmin
                ? 'bg-pr-red/15 border-pr-red/40 text-pr-red'
                : 'bg-teal-900/40 border-teal-700 text-teal-300'
            }`}
          >
            {isAdmin ? 'Admin' : 'Instructor'}
          </span>
          {displayName && (
            <span className="text-sm text-zinc-500">Signed in as {displayName}</span>
          )}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Link
            href="/admin/instructors"
            className="p-6 rounded-lg bg-zinc-900 border border-zinc-800 hover:border-pr-red transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="84" height="28" viewBox="0 0 72 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="mb-3 text-pr-red">
              <circle cx="12" cy="7" r="4"/><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
              <circle cx="36" cy="7" r="4"/><path d="M44 21v-2a4 4 0 0 0-4-4H32a4 4 0 0 0-4 4v2"/>
              <circle cx="60" cy="7" r="4"/><path d="M68 21v-2a4 4 0 0 0-4-4H56a4 4 0 0 0-4 4v2"/>
            </svg>
            <h2 className="font-semibold text-lg mb-1">Instructor Profiles</h2>
            <p className="text-zinc-400 text-sm">Certifications, expertise, and portal access</p>
          </Link>
          <Link
            href="/admin/courses"
            className="p-6 rounded-lg bg-zinc-900 border border-zinc-800 hover:border-pr-red transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="mb-3 text-pr-red">
              <rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/><path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01"/>
            </svg>
            <h2 className="font-semibold text-lg mb-1">Courses</h2>
            <p className="text-zinc-400 text-sm">Schedule and manage course instances</p>
          </Link>
          <Link
            href="/instructor"
            className="p-6 rounded-lg bg-zinc-900 border border-zinc-800 hover:border-pr-red transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="mb-3 text-pr-red">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
            </svg>
            <h2 className="font-semibold text-lg mb-1">My Profile</h2>
            <p className="text-zinc-400 text-sm">Manage your bio, photo, and certifications</p>
          </Link>
          {profile?.role === 'admin' && (
            <Link
              href="/admin/contact"
              className="p-6 rounded-lg bg-zinc-900 border border-zinc-800 hover:border-pr-red transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="mb-3 text-pr-red">
                <rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>
              </svg>
              <h2 className="font-semibold text-lg mb-1">Contact Submissions</h2>
              <p className="text-zinc-400 text-sm">Messages from the public contact form</p>
            </Link>
          )}
          {profile?.role === 'admin' && (
            <Link
              href="/admin/gallery"
              className="p-6 rounded-lg bg-zinc-900 border border-zinc-800 hover:border-pr-red transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="mb-3 text-pr-red">
                <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/>
              </svg>
              <h2 className="font-semibold text-lg mb-1">Gallery</h2>
              <p className="text-zinc-400 text-sm">Upload and manage public gallery photos</p>
            </Link>
          )}
        </div>
      </div>
    </main>
  )
}
