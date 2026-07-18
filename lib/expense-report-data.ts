// Server-side loader that assembles everything the PDF generator needs for a
// report. Used by the submit action (email attachment) and the download route.

import { createAdminClient } from '@/lib/supabase/admin'
import { type ExpenseCategory } from '@/lib/expenses'
import { instanceLabel } from '@/lib/courses'
import { type PdfReport } from '@/lib/expense-pdf'

export type LoadedReport = {
  id: string
  profile_id: string
  reason: string | null
  status: 'draft' | 'submitted'
  submitted_at: string | null
  default_instance_id: string | null
}

export type LoadedItem = {
  id: string
  start_date: string
  end_date: string | null
  category: ExpenseCategory
  paid_by: 'personal' | 'company_card'
  description: string | null
  details: string | null
  paid_for_others: boolean
  miles: number | null
  meal_count: number | null
  amount: number
  instance_id: string | null
  sort_order: number
  expense_receipts: { id: string; path: string; filename: string | null }[]
}

export async function loadReport(reportId: string): Promise<{
  report: LoadedReport
  items: LoadedItem[]
  pdfReport: PdfReport
  receiptPaths: { path: string; filename: string | null }[]
} | null> {
  const admin = createAdminClient()

  const { data: report } = await admin
    .from('expense_reports')
    .select('id, profile_id, reason, status, submitted_at, default_instance_id')
    .eq('id', reportId)
    .single()
  if (!report) return null

  const { data: profile } = await admin
    .from('profiles')
    .select('first_name, last_name, signature_data_url')
    .eq('id', report.profile_id)
    .single()

  const { data: itemRows } = await admin
    .from('expense_items')
    .select('id, start_date, end_date, category, paid_by, description, details, paid_for_others, miles, meal_count, amount, instance_id, sort_order, expense_receipts(id, path, filename)')
    .eq('report_id', reportId)
    .order('sort_order')
    .order('start_date')

  const items = (itemRows ?? []) as LoadedItem[]

  // Resolve course titles for items + report default.
  const instanceIds = [
    ...new Set(
      [report.default_instance_id, ...items.map((i) => i.instance_id)].filter(
        (v): v is string => Boolean(v)
      )
    ),
  ]
  const { data: instances } = instanceIds.length
    ? await admin
        .from('course_instances')
        .select('id, ref_number, course_type, custom_title, client_name, location, starts_at')
        .in('id', instanceIds)
    : { data: [] }
  const titleMap = new Map((instances ?? []).map((i) => [i.id, instanceLabel(i)]))

  const employeeName = [profile?.first_name, profile?.last_name].filter(Boolean).join(' ') || 'Unknown'

  const pdfReport: PdfReport = {
    employeeName,
    reason: report.reason,
    submittedAt: report.submitted_at ? new Date(report.submitted_at) : new Date(),
    signaturePngDataUrl: profile?.signature_data_url ?? null,
    items: items.map((i) => ({
      start_date: i.start_date,
      end_date: i.end_date,
      category: i.category,
      paid_by: i.paid_by,
      description: i.description,
      details: i.details,
      paid_for_others: i.paid_for_others,
      miles: i.miles === null ? null : Number(i.miles),
      amount: Number(i.amount),
      courseTitle: titleMap.get(i.instance_id ?? report.default_instance_id ?? '') ?? null,
    })),
  }

  const receiptPaths = items.flatMap((i) => i.expense_receipts.map((r) => ({ path: r.path, filename: r.filename })))

  return { report: report as LoadedReport, items, pdfReport, receiptPaths }
}
