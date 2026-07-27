import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { setSubmissionArchived, setSubmissionSpam } from './actions'
import { DeleteButton } from './DeleteButton'

const INTEREST_LABELS: Record<string, string> = {
  tactical: 'Military & Tactical',
  sar: 'Backcountry & SAR',
  industrial: 'Industrial & Facilities',
  specialty: 'Specialty & Commercial',
  custom: 'Custom / Multiple Programs',
  courses: 'Online Courses',
}

type Submission = {
  id: string
  created_at: string
  first_name: string
  last_name: string
  email: string
  organization: string | null
  interest: string | null
  message: string
  archived: boolean
  spam: boolean
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
  })
}

function SubmissionCard({ s }: { s: Submission }) {
  return (
    <div className="p-5 rounded-lg bg-zinc-900 border border-zinc-800">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="font-semibold">{s.first_name} {s.last_name}</h3>
          <a href={`mailto:${s.email}`} className="text-sm text-pr-red hover:text-pr-red-light transition-colors">{s.email}</a>
        </div>
        <span className="text-xs text-zinc-500 shrink-0 mt-1">{fmtDate(s.created_at)}</span>
      </div>
      {(s.organization || s.interest) && (
        <div className="flex flex-wrap gap-2 mt-3">
          {s.organization && (
            <span className="text-xs px-2 py-0.5 rounded bg-zinc-800 text-zinc-300">{s.organization}</span>
          )}
          {s.interest && (
            <span className="text-xs px-2 py-0.5 rounded bg-zinc-800 text-zinc-300">
              {INTEREST_LABELS[s.interest] ?? s.interest}
            </span>
          )}
        </div>
      )}
      <p className="text-sm text-zinc-300 mt-3 whitespace-pre-wrap leading-relaxed">{s.message}</p>
      <div className="mt-4 flex justify-end gap-4">
        <form action={setSubmissionSpam.bind(null, s.id, !s.spam)}>
          <button type="submit" className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors">
            {s.spam ? 'Not spam' : 'Spam'}
          </button>
        </form>
        {!s.spam && (
          <form action={setSubmissionArchived.bind(null, s.id, !s.archived)}>
            <button type="submit" className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors">
              {s.archived ? 'Unarchive' : 'Archive'}
            </button>
          </form>
        )}
        <DeleteButton id={s.id} name={`${s.first_name} ${s.last_name}`} />
      </div>
    </div>
  )
}

export default async function AdminContactPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = createAdminClient()
  const { data: profile } = await admin.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') redirect('/dashboard')

  const { data, error } = await admin
    .from('contact_submissions')
    .select('*')
    .order('created_at', { ascending: false })

  const submissions = (data ?? []) as Submission[]
  const active = submissions.filter(s => !s.archived && !s.spam)
  const archived = submissions.filter(s => s.archived && !s.spam)
  const spam = submissions.filter(s => s.spam)

  return (
    <main className="min-h-screen bg-zinc-950 text-white pt-16 md:pt-20">
      <div className="max-w-4xl mx-auto px-4 py-10">
        <Link href="/admin" className="text-sm text-zinc-500 hover:text-zinc-300 transition-colors mb-6 inline-block">← Portal</Link>
        <h1 className="text-2xl font-bold mb-1">Contact Submissions</h1>
        <p className="text-zinc-400 mb-8">Messages sent through the public contact form.</p>

        {error && (
          <div className="p-4 rounded-lg bg-yellow-900/30 border border-yellow-800 text-sm text-yellow-200 mb-6">
            Couldn&apos;t load submissions — the <code>contact_submissions</code> table may not exist yet.
            Run migration 035 against the database.
          </div>
        )}

        {!error && submissions.length === 0 && (
          <p className="text-zinc-500 text-sm">No submissions yet.</p>
        )}

        {active.length > 0 && (
          <div className="space-y-4">
            {active.map(s => <SubmissionCard key={s.id} s={s} />)}
          </div>
        )}

        {archived.length > 0 && (
          <>
            <h2 className="text-sm font-medium text-zinc-500 uppercase tracking-wide mt-10 mb-4">Archived</h2>
            <div className="space-y-4 opacity-60">
              {archived.map(s => <SubmissionCard key={s.id} s={s} />)}
            </div>
          </>
        )}

        {spam.length > 0 && (
          <>
            <h2 className="text-sm font-medium text-zinc-500 uppercase tracking-wide mt-10 mb-4">
              Spam ({spam.length})
            </h2>
            <div className="space-y-4 opacity-60">
              {spam.map(s => <SubmissionCard key={s.id} s={s} />)}
            </div>
          </>
        )}
      </div>
    </main>
  )
}
