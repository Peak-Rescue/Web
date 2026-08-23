import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolvePublicWaiverToken } from '@/lib/waiver-data'
import PublicWaiver from './PublicWaiver'

// The page behind the course QR code. No account, no session, no roster.
//
// It names the course so nobody signs the wrong one, and that is the only
// thing it discloses — deliberately not who else is on it.

export const metadata = { robots: { index: false, follow: false } }

export default async function PublicWaiverPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const resolved = await resolvePublicWaiverToken(token, createAdminClient())
  if (!resolved.ok && resolved.reason === 'unknown') notFound()

  return (
    <main className="min-h-screen bg-zinc-950 text-white">
      <div className="max-w-3xl mx-auto px-4 py-10">
        {!resolved.ok ? (
          <div className="px-5 py-6 rounded-lg border border-zinc-800 bg-zinc-900">
            <h1 className="text-lg font-semibold mb-1">
              {resolved.reason === 'expired' ? 'This waiver link has expired' : 'No waiver to sign'}
            </h1>
            <p className="text-sm text-zinc-400">
              {resolved.reason === 'expired'
                ? 'Ask your instructor for the current code.'
                : 'There is no waiver set up for this course yet — please check with your instructor.'}
            </p>
          </div>
        ) : (
          <PublicWaiver
            token={token}
            body={resolved.target.body}
            courseTitle={resolved.target.courseTitle}
            courseSubtitle={resolved.target.courseSubtitle}
            templateName={resolved.target.templateName}
          />
        )}
      </div>
    </main>
  )
}
