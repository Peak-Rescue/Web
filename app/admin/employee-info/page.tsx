import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// Grouped so future sections (hiring paperwork, benefits, safety protocols)
// are a new entry here rather than new JSX.
const SECTIONS: {
  title: string
  resources: { title: string; description: string; url: string; kind: string }[]
}[] = [
  {
    title: 'Policies & guides',
    resources: [
      {
        title: 'Employee Handbook',
        description: 'Company policies, expectations, and general employment information',
        url: 'https://docs.google.com/document/d/1N-vY8RGrITPGrWD1ymQvqoQdMKX1Qela/edit',
        kind: 'Google Doc',
      },
    ],
  },
]

export default async function EmployeeInfoPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = createAdminClient()
  const { data: profile } = await admin.from('profiles').select('role').eq('id', user.id).single()
  if (!['admin', 'instructor'].includes(profile?.role ?? '')) redirect('/dashboard')

  return (
    <main className="min-h-screen bg-zinc-950 text-white pt-16 md:pt-20">
      <div className="max-w-4xl mx-auto px-4 py-10">
        <Link href="/admin" className="text-sm text-zinc-500 hover:text-zinc-300 transition-colors mb-6 inline-block">← Portal</Link>
        <h1 className="text-2xl font-bold mb-2">Employee Information</h1>
        <p className="text-zinc-400 text-sm mb-8">Handbook, policies, and employment documents</p>

        {SECTIONS.map((section) => (
          <section key={section.title} className="mb-10">
            <h2 className="text-sm font-medium text-zinc-500 uppercase tracking-wide mb-3">{section.title}</h2>
            <div className="space-y-2">
              {section.resources.map((r) => (
                <a
                  key={r.url}
                  href={r.url}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-4 px-4 py-3 bg-zinc-900 border border-zinc-800 rounded-lg hover:border-pr-red transition-colors"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-pr-red">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>
                  </svg>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{r.title}</p>
                    <p className="text-xs text-zinc-500 mt-0.5">{r.description}</p>
                  </div>
                  <span className="shrink-0 text-[10px] font-medium px-2 py-0.5 rounded-full border border-zinc-700 bg-zinc-800/50 text-zinc-400">
                    {r.kind}
                  </span>
                </a>
              ))}
            </div>
          </section>
        ))}
      </div>
    </main>
  )
}
