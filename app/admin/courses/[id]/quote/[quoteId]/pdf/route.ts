import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { generateQuotePdf } from '@/lib/quote-pdf'
import { courseDisplayName, courseShortName } from '@/lib/courses'
import { quoteNumber } from '@/lib/quotes'

// Renders a quote PDF on demand. Admin-only, like all financials.
export async function GET(_req: Request, ctx: { params: Promise<{ id: string; quoteId: string }> }) {
  const { id, quoteId } = await ctx.params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const admin = createAdminClient()
  const { data: profile } = await admin.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return new Response('Not found', { status: 404 })

  const [{ data: quote }, { data: inst }] = await Promise.all([
    admin.from('course_quotes').select('*').eq('id', quoteId).eq('instance_id', id).single(),
    admin
      .from('course_instances')
      .select('ref_number, course_type, custom_title, client_name, location, starts_at, ends_at')
      .eq('id', id)
      .single(),
  ])
  if (!quote || !inst) return new Response('Not found', { status: 404 })

  const fmtShort = (d: string) =>
    new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  const datesLabel = inst.starts_at
    ? `${fmtShort(inst.starts_at)}${inst.ends_at && inst.ends_at !== inst.starts_at ? ` – ${fmtShort(inst.ends_at)}` : ''}`
    : 'Dates TBD'

  const pdfBytes = await generateQuotePdf({
    refNumber: inst.ref_number,
    quoteSeq: quote.quote_seq,
    courseName: courseDisplayName(inst.course_type, inst.custom_title),
    courseTypeLabel: courseShortName(inst.course_type, inst.custom_title),
    clientName: inst.client_name,
    location: inst.location,
    datesLabel,
    issueDate: quote.issue_date,
    validUntil: quote.valid_until,
    total: Number(quote.total),
    unitRateNote: quote.unit_rate_note,
    scopeBullets: quote.scope_bullets ?? [],
    courseBlurb: quote.course_blurb,
    preparedByName: quote.prepared_by_name,
    preparedByEmail: quote.prepared_by_email,
  })

  const filename = `Peak Rescue Quote ${quoteNumber(inst.ref_number, quote.quote_seq)}.pdf`
  return new Response(Buffer.from(pdfBytes), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${filename.replace(/[^\w .-]/g, '')}"`,
    },
  })
}
