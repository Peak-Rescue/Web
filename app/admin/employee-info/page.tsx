import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { addResource, deleteResource } from './actions'

type Resource = {
  id: string
  section: string
  title: string
  description: string | null
  url: string
}

// Badge label from the link itself so admins don't have to pick a type.
function linkKind(url: string): string {
  try {
    const u = new URL(url)
    if (u.hostname === 'docs.google.com') {
      if (u.pathname.startsWith('/document')) return 'Google Doc'
      if (u.pathname.startsWith('/spreadsheets')) return 'Google Sheet'
      if (u.pathname.startsWith('/presentation')) return 'Google Slides'
      if (u.pathname.startsWith('/forms')) return 'Google Form'
      return 'Google Doc'
    }
    if (u.hostname === 'drive.google.com') return 'Google Drive'
    return u.hostname.replace(/^www\./, '')
  } catch {
    return 'Link'
  }
}

const inputClass =
  'w-full bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-zinc-500 transition-colors'

export default async function EmployeeInfoPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = createAdminClient()
  const { data: profile } = await admin.from('profiles').select('role').eq('id', user.id).single()
  if (!['admin', 'instructor'].includes(profile?.role ?? '')) redirect('/dashboard')
  const isAdmin = profile?.role === 'admin'

  const { data: rows } = await admin
    .from('employee_resources')
    .select('id, section, title, description, url')
    .order('section')
    .order('sort_order')
    .order('created_at')

  const resources = (rows ?? []) as Resource[]
  const sections = [...new Set(resources.map((r) => r.section))]

  return (
    <main className="min-h-screen bg-zinc-950 text-white pt-16 md:pt-20">
      <div className="max-w-4xl mx-auto px-4 py-10">
        <Link href="/admin" className="text-sm text-zinc-500 hover:text-zinc-300 transition-colors mb-6 inline-block">← Portal</Link>
        <h1 className="text-2xl font-bold mb-2">Employee Information</h1>
        <p className="text-zinc-400 text-sm mb-8">Handbook, policies, and employment documents</p>

        {resources.length === 0 && (
          <p className="text-sm text-zinc-500 mb-10">No documents yet.</p>
        )}

        {sections.map((section) => (
          <section key={section} className="mb-10">
            <h2 className="text-sm font-medium text-zinc-500 uppercase tracking-wide mb-3">{section}</h2>
            <div className="space-y-2">
              {resources.filter((r) => r.section === section).map((r) => (
                <div key={r.id} className="flex items-center gap-2">
                  <a
                    href={r.url}
                    target="_blank"
                    rel="noreferrer"
                    className="flex flex-1 items-center gap-4 px-4 py-3 bg-zinc-900 border border-zinc-800 rounded-lg hover:border-pr-red transition-colors min-w-0"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-pr-red">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>
                    </svg>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{r.title}</p>
                      {r.description && <p className="text-xs text-zinc-500 mt-0.5 truncate">{r.description}</p>}
                    </div>
                    <span className="shrink-0 text-[10px] font-medium px-2 py-0.5 rounded-full border border-zinc-700 bg-zinc-800/50 text-zinc-400">
                      {linkKind(r.url)}
                    </span>
                  </a>
                  {isAdmin && (
                    <form action={deleteResource.bind(null, r.id)}>
                      <button
                        type="submit"
                        aria-label={`Remove ${r.title}`}
                        className="p-2 text-zinc-600 hover:text-pr-red transition-colors"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                        </svg>
                      </button>
                    </form>
                  )}
                </div>
              ))}
            </div>
          </section>
        ))}

        {isAdmin && (
          <section className="mt-12 pt-8 border-t border-zinc-800">
            <h2 className="text-sm font-medium text-zinc-500 uppercase tracking-wide mb-4">Add a document link</h2>
            <form action={addResource} className="space-y-3 max-w-xl">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <input type="text" name="title" required placeholder="Title" className={inputClass} />
                <input
                  type="text"
                  name="section"
                  list="employee-info-sections"
                  placeholder="Section (default: Policies & guides)"
                  className={inputClass}
                />
                <datalist id="employee-info-sections">
                  {sections.map((s) => <option key={s} value={s} />)}
                </datalist>
              </div>
              <input type="url" name="url" required placeholder="https://docs.google.com/…" className={inputClass} />
              <input type="text" name="description" placeholder="Short description (optional)" className={inputClass} />
              <button
                type="submit"
                className="px-4 py-2 bg-pr-red hover:bg-red-700 rounded text-sm font-medium transition-colors"
              >
                Add link
              </button>
            </form>
          </section>
        )}
      </div>
    </main>
  )
}
