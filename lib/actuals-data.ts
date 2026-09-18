// One loader behind every view of a course's actuals: the admin panel, the
// read-only page we email out, and the PDF.
//
// It exists because there are now four readers of the same numbers, and the
// moment two of them assemble their own the emailed page starts disagreeing
// with the screen it was sent from. The roll-up itself is in lib/actuals.ts;
// this is the part that knows where the rows are.

import { type createAdminClient } from '@/lib/supabase/admin'
import {
  rollUpActuals,
  DEFAULT_PAYROLL_LOAD,
  type Actuals,
  type ActualExpenseLine,
  type CostAccount,
  type PayLine,
  type TypedCostLine,
} from '@/lib/actuals'
import { paySettingsFrom, NO_TERMS, type PayPerson, type PaySettings, type PayTerms } from '@/lib/pay'

type Admin = ReturnType<typeof createAdminClient>

export type LoadedActuals = {
  /** Null until somebody touches the course's actuals. */
  exists: boolean
  invoiced: number | null
  /** The course's own override, or null when it follows the org. */
  payrollLoadOverride: number | null
  /** The org-wide number, whatever the course does with it. */
  orgPayrollLoad: number
  /** What the roll-up actually used. */
  payrollLoadPct: number
  notes: string | null
  closedAt: string | null
  /** When the estimate was copied in as a starting point, or null if it never
      was. Once set, it stays set — a seeded line somebody deleted must not
      come back the next time the panel is opened. */
  seededAt: string | null
  /** When these numbers were last emailed out, or null if never. */
  shareSentAt: string | null
  shareToken: string | null
  accounts: CostAccount[]
  expenseLines: ActualExpenseLine[]
  expenseAccounts: [string, string][]
  payLines: PayLine[]
  costLines: TypedCostLine[]
  /** Company-card charges tagged to this course. Read, never copied — the
      statement row is the only record of itself, so re-tagging it on the card
      screen moves the money rather than leaving a stale copy here. Rolled up
      alongside the typed lines, because to the books they are the same thing. */
  cardLines: TypedCostLine[]
  /** Names for pay lines, by both ids a line can name somebody with: the
      roster row and the portal account. Keyed together because a reader wants
      one lookup and the two id spaces cannot collide — and because half the
      crew has no account, so accounts alone would leave real people unnamed
      on an emailed page of accounts. */
  peopleById: Record<string, string>
  /** The staffed crew as pay is worked out for them: who they are, whether
      overtime is theirs, and what this course pays them an hour. Everybody on
      the roster, account or not — somebody can work a course before they ever
      log in, and they still have to be paid. In roster order, which is the
      order their pay rows appear in. */
  payPeople: PayPerson[]
  /** The shared constants behind every hour: the travel rate, the length of a
      day, and the overtime rule. */
  paySettings: PaySettings
  /** The hourly rates somebody can be put on, for the per-person picker. */
  fieldRateChoices: number[]
  rolled: Actuals
}

export async function loadActuals(admin: Admin, instanceId: string): Promise<LoadedActuals> {
  const [
    { data: row },
    { data: accountRows },
    { data: payItemRows },
    { data: costItemRows },
    { data: cardChargeRows },
    { data: expenseLineRows },
    { data: expenseAccountRows },
    { data: orgRows },
    { data: profileRows },
    { data: rosterRows },
    { data: fieldRateRows },
    { data: coursePayRateRows },
  ] = await Promise.all([
    admin
      .from('course_actuals')
      .select('invoiced, payroll_load_pct, notes, closed_at, seeded_at, share_token, share_sent_at')
      .eq('instance_id', instanceId)
      .maybeSingle(),
    admin.from('cost_accounts').select('id, label, categories, sort_order').eq('active', true).order('sort_order'),
    admin
      .from('course_pay_items')
      .select('id, instructor_id, profile_id, description, amount, hours, hourly_rate')
      .eq('instance_id', instanceId)
      .order('sort_order')
      .order('created_at'),
    admin
      .from('course_cost_items')
      .select('id, account_id, description, amount, payment_method, payment_ref')
      .eq('instance_id', instanceId)
      .order('sort_order')
      .order('created_at'),
    admin
      .from('card_charges')
      .select('id, account_id, posted_date, description, amount, cardholder')
      .eq('instance_id', instanceId)
      .order('posted_date'),
    (async () => {
      // Expense money is read, never copied: a report corrected next week has
      // to move this course's net, and a snapshot would quietly stop matching.
      //
      // Two queries because a line belongs to this course two different ways
      // — it says so itself, or its report's default course says so for it,
      // which is how a single-course trip needs no per-item links at all.
      // Drafts come too: they are kept out of the totals by the roll-up, not
      // by the query, because a reader has to be able to see what is coming.
      const cols =
        'id, category, amount, start_date, description, details, paid_by, report_id, expense_reports!inner(status, default_instance_id, profiles(first_name, last_name))'
      const [own, inherited] = await Promise.all([
        admin.from('expense_items').select(cols).eq('instance_id', instanceId),
        admin
          .from('expense_items')
          .select(cols)
          .is('instance_id', null)
          .eq('non_course', false)
          .eq('expense_reports.default_instance_id', instanceId),
      ])
      return { data: [...(own.data ?? []), ...(inherited.data ?? [])] }
    })(),
    // Every re-filing, not just this course's. Only exceptions are stored — a
    // line following its category has no row — so the table stays small, and
    // narrowing it to this course would mean running the two-way join above a
    // second time just to know which item ids to ask about.
    admin.from('expense_item_accounts').select('expense_item_id, account_id'),
    // Every org-wide number in one read. It was the payroll load alone; pay
    // by the hour added four more, and five single-key queries would be five
    // round trips for one small table.
    admin.from('org_settings').select('key, value'),
    admin.from('profiles').select('id, first_name, last_name'),
    // The crew, with the two facts that travel with a person: whether the
    // premium is theirs (the account's FLSA flag, 039) and whether their
    // course days are paid at all. What they earn an hour does not travel
    // with them — it is checked on this course, below.
    admin
      .from('instance_instructors')
      .select('instructors(id, name, profile_id, paid_for_days, profiles(is_exempt))')
      .eq('instance_id', instanceId),
    admin.from('pay_field_rates').select('hourly').eq('active', true).order('hourly', { ascending: false }),
    admin
      .from('course_pay_rates')
      .select('instructor_id, field_hourly, starts_at, ends_at, travel_days, hours_per_day')
      .eq('instance_id', instanceId),
  ])

  const accounts: CostAccount[] = (accountRows ?? []).map((a) => ({
    id: a.id as string,
    label: a.label as string,
    categories: (a.categories as string[] | null) ?? [],
    sort_order: a.sort_order as number,
  }))

  type ExpenseLineRow = {
    id: string
    category: string
    amount: number | string
    start_date: string
    description: string | null
    details: string | null
    paid_by: 'personal' | 'company_card'
    report_id: string
    expense_reports: {
      status: string
      profiles: { first_name: string | null; last_name: string | null } | null
    } | null
  }
  const expenseLines: ActualExpenseLine[] = ((expenseLineRows ?? []) as unknown as ExpenseLineRow[]).map((r) => {
    const person = r.expense_reports?.profiles
    return {
      id: r.id,
      category: r.category,
      amount: Number(r.amount),
      start_date: r.start_date,
      description: r.description,
      details: r.details,
      paid_by: r.paid_by,
      submitted: r.expense_reports?.status === 'submitted',
      personName: [person?.first_name, person?.last_name].filter(Boolean).join(' ') || null,
      reportId: r.report_id,
    }
  })

  const payLines: PayLine[] = (payItemRows ?? []).map((l) => ({
    id: l.id as string,
    instructor_id: (l.instructor_id as string | null) ?? null,
    profile_id: (l.profile_id as string | null) ?? null,
    description: (l.description as string | null) ?? null,
    amount: Number(l.amount),
    hours: l.hours === null || l.hours === undefined ? null : Number(l.hours),
    hourly_rate: l.hourly_rate === null || l.hourly_rate === undefined ? null : Number(l.hourly_rate),
  }))

  const costLines: TypedCostLine[] = (costItemRows ?? []).map((l) => ({
    id: l.id as string,
    account_id: (l.account_id as string | null) ?? null,
    description: (l.description as string | null) ?? null,
    amount: Number(l.amount),
    source: 'typed' as const,
    payment_method: (l.payment_method as TypedCostLine['payment_method']) ?? null,
    payment_ref: (l.payment_ref as string | null) ?? null,
  }))

  const cardLines: TypedCostLine[] = (cardChargeRows ?? []).map((c) => ({
    id: c.id as string,
    account_id: (c.account_id as string | null) ?? null,
    spend_date: (c.posted_date as string | null) ?? null,
    description: (c.description as string | null) ?? null,
    amount: Number(c.amount),
    source: 'card' as const,
    cardholder: (c.cardholder as string | null) ?? null,
  }))

  // Only the lines this course can actually show. An override row for some
  // other course's expense would otherwise re-file a line that isn't here.
  const expenseAccounts: [string, string][] = (expenseAccountRows ?? [])
    .filter((r) => expenseLines.some((l) => l.id === r.expense_item_id))
    .map((r) => [r.expense_item_id as string, r.account_id as string])

  const orgSettings = (orgRows ?? []).map((o) => ({ key: o.key as string, value: o.value as number }))
  const loadRow = orgSettings.find((o) => o.key === 'payroll_load_pct')
  const orgPayrollLoad = loadRow ? Number(loadRow.value) : DEFAULT_PAYROLL_LOAD
  const paySettings = paySettingsFrom(orgSettings)

  // What this course pays each person an hour. Only this course says: the
  // rate follows the role and the course type, so there is nothing to
  // inherit. Missing stays missing, because a rate nobody has checked is a
  // question for a human and not a zero to multiply by.
  const num = (v: unknown) => (v === null || v === undefined ? null : Number(v))
  const payTerms: Record<string, PayTerms> = Object.fromEntries(
    (coursePayRateRows ?? []).map((r) => [
      r.instructor_id as string,
      {
        fieldHourly: num(r.field_hourly),
        startsAt: (r.starts_at as string | null) ?? null,
        endsAt: (r.ends_at as string | null) ?? null,
        travelDays: num(r.travel_days),
        hoursPerDay: num(r.hours_per_day),
      },
    ])
  )
  type RosterRow = {
    id: string
    name: string | null
    profile_id: string | null
    paid_for_days: boolean | null
    profiles: { is_exempt: boolean | null } | null
  }
  const payPeople: PayPerson[] = ((rosterRows ?? [])
    .map((r) => r.instructors as unknown as RosterRow | null)
    .filter((i): i is RosterRow => Boolean(i?.id && i?.name)))
    .map((i) => ({
      id: i.id,
      profileId: i.profile_id ?? null,
      name: i.name as string,
      // Unlinked crew count as non-exempt: the law's default, and the safer
      // of the two errors.
      exempt: Boolean(i.profiles?.is_exempt),
      // Absent counts as paid, which is what everybody but Micah is.
      paidForDays: i.paid_for_days !== false,
      terms: payTerms[i.id] ?? NO_TERMS,
    }))
    .sort((a, b) => a.name.localeCompare(b.name))

  const payrollLoadOverride =
    row?.payroll_load_pct === null || row?.payroll_load_pct === undefined ? null : Number(row.payroll_load_pct)
  const payrollLoadPct = payrollLoadOverride ?? orgPayrollLoad
  const invoiced = row?.invoiced === null || row?.invoiced === undefined ? null : Number(row.invoiced)

  return {
    exists: Boolean(row),
    invoiced,
    payrollLoadOverride,
    orgPayrollLoad,
    payrollLoadPct,
    notes: row?.notes ?? null,
    closedAt: row?.closed_at ?? null,
    seededAt: (row?.seeded_at as string | null) ?? null,
    shareSentAt: (row?.share_sent_at as string | null) ?? null,
    shareToken: (row?.share_token as string | null) ?? null,
    accounts,
    expenseLines,
    expenseAccounts,
    payLines,
    costLines,
    cardLines,
    payPeople,
    paySettings,
    fieldRateChoices: (fieldRateRows ?? []).map((r) => Number(r.hourly)),
    peopleById: Object.fromEntries([
      ...(profileRows ?? []).map((p) => [
        p.id as string,
        [p.first_name, p.last_name].filter(Boolean).join(' ') || 'Unknown',
      ]),
      ...payPeople.map((p) => [p.id, p.name]),
    ]),
    rolled: rollUpActuals({
      accounts,
      expenseLines,
      expenseAccountOverrides: new Map(expenseAccounts),
      typedLines: [...costLines, ...cardLines],
      payLines,
      payrollLoadPct,
      invoiced: invoiced ?? 0,
    }),
  }
}
