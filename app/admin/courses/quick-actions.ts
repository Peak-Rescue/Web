'use server'

import { requireAdminUser } from '@/lib/course-access'
import { parseContacts, primaryContactEmail, ccEmailOptions } from '@/lib/contacts'
import { loadStaffingPanel, type StaffingPanelData } from '@/lib/staffing-panel'
import { loadBillingPanel, type BillingPanelData } from '@/lib/billing-handoff'

// What the courses list needs to open a quick-action drawer under a row.
//
// Data, not markup. Returning the rendered panel would have been neater — the
// list would show the very component the course page shows — but a client
// component reached only through a server action is not in the calling page's
// client manifest, and React drops it on arrival with "Could not find the
// module … in the React Client Manifest". So the loaders come back here and
// the panels are drawn by the list, out of the same components and the same
// loader the course page uses.
//
// Loaded on open rather than with the page: a list of thirty courses that
// prepared thirty staffing panels would do thirty courses' worth of work to
// show one.

/** Who is running this course, and who could be — the course page's staffing
    block, in a drawer. */
export async function staffingData(instanceId: string): Promise<StaffingPanelData> {
  const { admin } = await requireAdminUser()

  const [{ data: inst }, { data: offDays }] = await Promise.all([
    admin
      .from('course_instances')
      .select('course_type, course_category, custom_categories, internal, starts_at, ends_at')
      .eq('id', instanceId)
      .single(),
    admin
      .from('instance_off_days')
      .select('id, off_date, end_date')
      .eq('instance_id', instanceId)
      .order('off_date'),
  ])
  if (!inst) throw new Error('Course not found')

  return loadStaffingPanel(admin, {
    instanceId,
    courseType: inst.course_type as string | null,
    courseCategory: inst.course_category as string | null,
    customCategories: inst.custom_categories as string[] | null,
    internal: Boolean(inst.internal),
    startsAt: inst.starts_at as string | null,
    endsAt: inst.ends_at as string | null,
    offDays: offDays ?? [],
  })
}

export type QuickQuote = {
  id: string
  number: string
  total: number
  acceptToken: string
}

export type QuoteQuickData = {
  instanceId: string
  drafts: QuickQuote[]
  /** Where the quote would go, or null if the course has no POC email yet. */
  contactEmail: string | null
  ccOptions: string[]
  adminCcOptions: { id: string; name: string; email: string }[]
}

/** The drafts sitting finished and still, and where each would be sent. */
export async function quoteData(instanceId: string): Promise<QuoteQuickData> {
  const { admin } = await requireAdminUser()
  const { quoteNumber } = await import('@/lib/quotes')

  const [{ data: inst }, { data: quotes }, { data: adminRows }] = await Promise.all([
    admin
      .from('course_instances')
      .select('ref_number, contacts')
      .eq('id', instanceId)
      .single(),
    admin
      .from('course_quotes')
      .select('id, quote_seq, status, total, accept_token, archived_at')
      .eq('instance_id', instanceId)
      .order('quote_seq'),
    admin.from('profiles').select('id, first_name, last_name, email').eq('role', 'admin'),
  ])
  if (!inst) throw new Error('Course not found')

  const contacts = parseContacts(inst.contacts)

  return {
    instanceId,
    drafts: (quotes ?? [])
      .filter((q) => q.status === 'draft' && !q.archived_at)
      .map((q) => ({
        id: q.id,
        number: quoteNumber(inst.ref_number as number, q.quote_seq as number),
        total: Number(q.total),
        acceptToken: q.accept_token as string,
      })),
    contactEmail: primaryContactEmail(contacts) || null,
    ccOptions: ccEmailOptions(contacts),
    adminCcOptions: ((adminRows ?? []) as { id: string; first_name: string | null; last_name: string | null; email: string | null }[])
      .filter((a) => Boolean(a.email))
      .map((a) => ({
        id: a.id,
        name: [a.first_name, a.last_name].filter(Boolean).join(' ') || (a.email as string),
        email: a.email as string,
      })),
  }
}

/** Handing the course to Harken: what to bill, who to bill, and what came
    back — the course page's Billing section, from the list. The amount it
    offers comes down the same chain the pricing page reads, so the drawer
    and the page never suggest two different figures. */
export async function billingData(instanceId: string): Promise<BillingPanelData> {
  const { admin } = await requireAdminUser()
  return loadBillingPanel(admin, instanceId)
}

export type BooksQuickData = {
  instanceId: string
  /** When somebody said the costs were final, or null while they are not. */
  closedAt: string | null
  invoiced: number | null
  /** Everything the course has cost, rolled up the same way the Actuals panel
      rolls it — typed lines, card charges and submitted expense money, plus
      pay and its load. */
  costTotal: number
  costLines: number
}

/** Our own side of the money: what the course cost, and whether anybody has
    said so for the last time.
 *
 *  Read through `loadActuals` rather than summed here. The numbers are the
 *  ones the course's own Actuals panel shows, and a second sum on the list
 *  would be a second answer waiting to disagree with the first. */
export async function booksData(instanceId: string): Promise<BooksQuickData> {
  const { admin } = await requireAdminUser()
  const { loadActuals } = await import('@/lib/actuals-data')
  const a = await loadActuals(admin, instanceId)

  return {
    instanceId,
    closedAt: a.closedAt,
    invoiced: a.rolled.invoiced || null,
    costTotal: a.rolled.costsTotal + a.rolled.instructorPay,
    costLines: a.costLines.length + a.cardLines.length + a.expenseLines.length + a.payLines.length,
  }
}
