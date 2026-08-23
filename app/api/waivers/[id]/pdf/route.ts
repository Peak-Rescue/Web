import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { courseAccess } from '@/lib/course-access'
import { loadWaiverPdfData } from '@/lib/waiver-data'
import { generateWaiverPdf } from '@/lib/waiver-pdf'

// A signed waiver, as the document it stands for.
//
// Rendered on request from the signature row rather than served from a file,
// because the row cannot change and the version it points at cannot change —
// so the copy downloaded in three years is the copy that was emailed on the
// day, without either having been kept anywhere.
//
// Who may read one: the person who signed it, and the staff running the course
// it belongs to. A waiver carries a date of birth, a home address and a next
// of kin, so this is narrower than "anyone on the course" — students can see
// their own and no one else's.

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const admin = createAdminClient()
  const { data: sig } = await admin
    .from('waiver_signatures')
    .select('id, instance_id, profile_id')
    .eq('id', id)
    .maybeSingle()
  // Not found rather than forbidden: whether a given waiver exists is itself
  // something only these people should learn.
  if (!sig) return new Response('Not found', { status: 404 })

  if (sig.profile_id !== user.id) {
    const access = await courseAccess(admin, user.id, sig.instance_id)
    if (!access.allowed || !access.isStaff) return new Response('Not found', { status: 404 })
  }

  const data = await loadWaiverPdfData(sig.id, admin)
  if (!data) return new Response('Not found', { status: 404 })

  const bytes = await generateWaiverPdf(data)
  const filename = `${data.courseTitle} waiver - ${data.lastName}.pdf`.replace(/[^\w .-]/g, '')
  return new Response(Buffer.from(bytes), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${filename}"`,
      // A signed waiver is personal and cheap to rebuild; nothing should keep
      // a copy of it on the way to the reader.
      'Cache-Control': 'private, no-store',
    },
  })
}
