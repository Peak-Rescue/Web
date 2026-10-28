// The part both quote PDF routes share: turn a quote into a rendered file.
//
// The admin's download and the client's download from the quote page differ
// only in who may ask. What comes out has to be the same file either way, or
// the copy we attached stops matching the copy the client filed.

import { createAdminClient } from '@/lib/supabase/admin'
import { courseDisplayName, courseShortName } from '@/lib/courses'
import { generateQuotePdf } from '@/lib/quote-pdf'
import { quoteCommitment, quoteNumber, type QuoteOption } from '@/lib/quotes'
import { todayHere } from '@/lib/course-clock'

export async function quotePdfResponse(quoteId: string): Promise<Response> {
  const admin = createAdminClient()

  const { data: quote } = await admin.from('course_quotes').select('*').eq('id', quoteId).maybeSingle()
  if (!quote) return new Response('Not found', { status: 404 })

  const [{ data: inst }, { data: payment }] = await Promise.all([
    admin
      .from('course_instances')
      .select('ref_number, course_type, course_category, custom_title, client_name, location, starts_at, ends_at')
      .eq('id', quote.instance_id)
      .maybeSingle(),
    admin
      .from('payments')
      .select('amount_paid, paid_at')
      .eq('quote_id', quote.id)
      .eq('status', 'completed')
      .order('paid_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])
  if (!inst) return new Response('Not found', { status: 404 })

  const fmtLong = (d: string) =>
    new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
  const dates = inst.starts_at
    ? `${fmtLong(inst.starts_at)}${inst.ends_at && inst.ends_at !== inst.starts_at ? ` – ${fmtLong(inst.ends_at)}` : ''}`
    : 'Dates to be confirmed'

  const qNum = quoteNumber(inst.ref_number, quote.quote_seq)
  const bytes = await generateQuotePdf({
    quoteNumber: qNum,
    courseName: courseDisplayName(inst.course_type, inst.custom_title),
    courseShortName: courseShortName(inst.course_type, inst.custom_title),
    clientName: inst.client_name,
    subtitle: [dates, inst.location].filter(Boolean).join('  ·  '),
    status: quote.status,
    total: Number(quote.total ?? 0),
    options: (quote.options ?? null) as QuoteOption[] | null,
    scopeBullets: (quote.scope_bullets ?? []) as string[],
    blurb: quote.course_blurb,
    validUntil: quote.valid_until,
    acceptedName: quote.accepted_name,
    acceptedAt: quote.accepted_at,
    paid:
      payment?.amount_paid != null
        ? { amount: Number(payment.amount_paid), on: payment.paid_at ? (payment.paid_at as string).slice(0, 10) : null }
        : null,
    preparedBy: quote.prepared_by_name ? { name: quote.prepared_by_name, email: quote.prepared_by_email } : null,
    commitment: quoteCommitment(inst.course_category),
    today: todayHere(),
  })

  return new Response(bytes as unknown as BodyInit, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${qNum}.pdf"`,
      // Status and payment are read live; a cached copy would say "open" after
      // it was accepted.
      'Cache-Control': 'no-store',
    },
  })
}
