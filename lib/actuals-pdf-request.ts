// The part both PDF routes share: turn a course into a rendered file.
//
// Two routes reach this — the admin's download, and the tokenised page's own
// download — and they differ only in who is allowed to ask. What comes out
// has to be byte-identical either way, or the copy somebody was emailed stops
// matching the copy we printed.

import { createAdminClient } from '@/lib/supabase/admin'
import { courseDisplayName } from '@/lib/courses'
import { courseSubtitle } from '@/lib/course-access'
import { loadActuals } from '@/lib/actuals-data'
import { generateActualsPdf } from '@/lib/actuals-pdf'
import { todayHere } from '@/lib/course-clock'
import { pickBillableQuote } from '@/lib/billing-handoff'

export async function actualsPdfResponse(instanceId: string): Promise<Response> {
  const admin = createAdminClient()

  const [{ data: inst }, actuals, { data: quoteRows }] = await Promise.all([
    admin
      .from('course_instances')
      .select('ref_number, course_type, custom_title, client_name, starts_at, ends_at, location, status')
      .eq('id', instanceId)
      .maybeSingle(),
    loadActuals(admin, instanceId),
    admin
      .from('course_quotes')
      .select('quote_seq, total, status, archived_at')
      .eq('instance_id', instanceId)
      .order('quote_seq', { ascending: false }),
  ])
  if (!inst) return new Response('Not found', { status: 404 })

  // The accepted quote, and only while it is still the one the client is
  // holding. A re-quote sent after it supersedes it — see pickBillableQuote —
  // and a superseded figure printed beside the actuals invites a client to
  // reconcile against a document we replaced.
  const billable = pickBillableQuote((quoteRows ?? []).map((q) => ({ ...q, total: Number(q.total ?? 0) })))
  const accepted = billable?.status === 'accepted' ? billable : null

  const bytes = await generateActualsPdf({
    courseTitle: courseDisplayName(inst.course_type, inst.custom_title),
    courseSubtitle: courseSubtitle(inst),
    actuals,
    acceptedQuote: accepted ? { seq: accepted.quote_seq as number, total: Number(accepted.total) } : null,
    generatedOn: todayHere(),
  })

  const name = `PR-${inst.ref_number}-actuals.pdf`
  return new Response(bytes as unknown as BodyInit, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${name}"`,
      // Money that is read live must not be served from a cache.
      'Cache-Control': 'no-store',
    },
  })
}
