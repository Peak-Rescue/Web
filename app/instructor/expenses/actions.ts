'use server'

import { randomUUID } from 'crypto'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  type ExpenseCategory,
  MEAL_CATEGORIES,
  categoriesFor,
  computeItem,
  computeTotals,
  fmtMoney,
} from '@/lib/expenses'
import { generateExpensePdf } from '@/lib/expense-pdf'
import { loadCurrentRates, loadReport } from '@/lib/expense-report-data'

const BUCKET = 'expense-receipts'
const MAX_RECEIPT_BYTES = 15 * 1024 * 1024
const MAX_EMAIL_ATTACHMENT_BYTES = 20 * 1024 * 1024

async function requireUser() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')
  return { user, admin: createAdminClient() }
}

// Report must belong to the caller; mutations additionally require draft status.
async function requireOwnedReport(reportId: string, opts: { draftOnly?: boolean } = {}) {
  const { user, admin } = await requireUser()
  const { data: report } = await admin
    .from('expense_reports')
    .select('id, profile_id, status')
    .eq('id', reportId)
    .single()
  if (!report || report.profile_id !== user.id) throw new Error('Report not found')
  if (opts.draftOnly && report.status !== 'draft') throw new Error('Report has already been submitted')
  return { user, admin, report }
}

function revalidateReport(reportId: string) {
  revalidatePath('/instructor/expenses')
  revalidatePath(`/instructor/expenses/${reportId}`)
  revalidatePath('/admin/expenses')
}

// ─── Report lifecycle ─────────────────────────────────────────────────────────

export async function createReport() {
  const { user, admin } = await requireUser()
  const { data, error } = await admin
    .from('expense_reports')
    .insert({ profile_id: user.id })
    .select('id')
    .single()
  if (error || !data) throw new Error(error?.message ?? 'Could not create report')
  revalidatePath('/instructor/expenses')
  redirect(`/instructor/expenses/${data.id}`)
}

export async function updateReportMeta(
  reportId: string,
  meta: { reason: string | null; default_instance_id: string | null }
) {
  const { admin } = await requireOwnedReport(reportId, { draftOnly: true })
  const { error } = await admin
    .from('expense_reports')
    .update({
      reason: meta.reason?.trim() || null,
      default_instance_id: meta.default_instance_id || null,
    })
    .eq('id', reportId)
  if (error) throw new Error(error.message)
  revalidateReport(reportId)
}

export async function deleteDraft(reportId: string) {
  const { admin } = await requireOwnedReport(reportId, { draftOnly: true })

  const { data: items } = await admin
    .from('expense_items')
    .select('expense_receipts(path)')
    .eq('report_id', reportId)
  const paths = (items ?? []).flatMap((i) => ((i.expense_receipts ?? []) as { path: string }[]).map((r) => r.path))
  if (paths.length > 0) await admin.storage.from(BUCKET).remove(paths)

  const { error } = await admin.from('expense_reports').delete().eq('id', reportId)
  if (error) throw new Error(error.message)
  revalidatePath('/instructor/expenses')
  redirect('/instructor/expenses')
}

// ─── Line items ───────────────────────────────────────────────────────────────

export type ItemPayload = {
  start_date: string
  end_date: string | null
  category: ExpenseCategory
  paid_by: 'personal' | 'company_card'
  description: string | null
  details: string | null
  paid_for_others: boolean
  miles: number | null
  meal_count: number | null
  amount: number | null
  instance_id: string | null
}

function validateItem(p: ItemPayload, isExempt: boolean) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(p.start_date)) throw new Error('Start date is required')
  if (p.end_date && p.end_date < p.start_date) throw new Error('End date must be on or after the start date')
  // MEAL_CATEGORIES are retired from the picker but stay valid so pre-existing
  // draft lines can still be edited and re-saved.
  if (!categoriesFor(isExempt).includes(p.category) && !MEAL_CATEGORIES.includes(p.category)) {
    throw new Error('Invalid category')
  }
  if (p.category === 'personal_auto' && !(p.miles && p.miles > 0)) throw new Error('Miles are required for personal auto')
  if (p.category === 'per_diem' && !(p.meal_count && p.meal_count > 0)) throw new Error('Number of meals covered is required')
  if (p.category === 'other' && !p.details?.trim()) throw new Error('Details are required for "Other" expenses')
  if (p.paid_for_others && !p.details?.trim()) throw new Error('List who was included when paying for others')
}

export async function saveItem(reportId: string, itemId: string | null, payload: ItemPayload) {
  const { user, admin } = await requireOwnedReport(reportId, { draftOnly: true })

  const { data: profile } = await admin.from('profiles').select('is_exempt').eq('id', user.id).single()
  validateItem(payload, profile?.is_exempt ?? false)

  const rates = await loadCurrentRates()
  const { amount, rate_used } = computeItem(payload, rates)

  const row = {
    report_id: reportId,
    start_date: payload.start_date,
    end_date: payload.end_date || null,
    category: payload.category,
    paid_by: payload.paid_by,
    description: payload.description?.trim() || null,
    details: payload.details?.trim() || null,
    paid_for_others: payload.paid_for_others,
    miles: payload.category === 'personal_auto' ? payload.miles : null,
    meal_count: payload.category === 'per_diem' ? payload.meal_count : null,
    rate_used,
    amount,
    instance_id: payload.instance_id || null,
  }

  let savedId = itemId
  if (itemId) {
    const { error } = await admin.from('expense_items').update(row).eq('id', itemId).eq('report_id', reportId)
    if (error) throw new Error(error.message)
  } else {
    const { data, error } = await admin.from('expense_items').insert(row).select('id').single()
    if (error || !data) throw new Error(error?.message ?? 'Could not save the expense')
    savedId = data.id
  }
  revalidateReport(reportId)
  return { id: savedId! }
}

export async function deleteItem(reportId: string, itemId: string) {
  const { admin } = await requireOwnedReport(reportId, { draftOnly: true })

  const { data: receipts } = await admin
    .from('expense_receipts')
    .select('path')
    .eq('item_id', itemId)
  if (receipts?.length) await admin.storage.from(BUCKET).remove(receipts.map((r) => r.path))

  const { error } = await admin.from('expense_items').delete().eq('id', itemId).eq('report_id', reportId)
  if (error) throw new Error(error.message)
  revalidateReport(reportId)
}

// ─── Receipts (direct-to-storage, same flow as the gallery uploader) ─────────

export async function createReceiptUploadTargets(
  reportId: string,
  files: { name: string; size: number }[]
): Promise<{ path: string; token: string }[]> {
  const { user, admin } = await requireOwnedReport(reportId, { draftOnly: true })

  const targets: { path: string; token: string }[] = []
  for (const file of files) {
    if (file.size > MAX_RECEIPT_BYTES) throw new Error(`"${file.name}" is over the 15 MB receipt limit`)
    const ext = (file.name.split('.').pop() ?? 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg'
    const path = `receipts/${user.id}/${reportId}/${randomUUID()}.${ext}`
    const { data, error } = await admin.storage.from(BUCKET).createSignedUploadUrl(path)
    if (error || !data) throw new Error(error?.message ?? 'Could not create upload URL')
    targets.push({ path: data.path, token: data.token })
  }
  return targets
}

export async function finalizeReceipts(
  reportId: string,
  itemId: string,
  uploads: { path: string; filename: string }[]
) {
  const { user, admin } = await requireOwnedReport(reportId, { draftOnly: true })

  // The item must belong to this report, and the path must be in the caller's prefix.
  const { data: item } = await admin
    .from('expense_items')
    .select('id')
    .eq('id', itemId)
    .eq('report_id', reportId)
    .single()
  if (!item) throw new Error('Item not found')

  const prefix = `receipts/${user.id}/${reportId}/`
  const rows = uploads
    .filter((u) => u.path.startsWith(prefix))
    .map((u) => ({ item_id: itemId, path: u.path, filename: u.filename.slice(0, 200) }))
  if (rows.length === 0) return

  const { error } = await admin.from('expense_receipts').insert(rows)
  if (error) throw new Error(error.message)
  revalidateReport(reportId)
}

export async function deleteReceipt(reportId: string, receiptId: string) {
  const { admin } = await requireOwnedReport(reportId, { draftOnly: true })

  const { data: receipt } = await admin
    .from('expense_receipts')
    .select('id, path, expense_items!inner(report_id)')
    .eq('id', receiptId)
    .single()
  if (!receipt || (receipt.expense_items as unknown as { report_id: string }).report_id !== reportId) {
    throw new Error('Receipt not found')
  }

  await admin.storage.from(BUCKET).remove([receipt.path])
  const { error } = await admin.from('expense_receipts').delete().eq('id', receiptId)
  if (error) throw new Error(error.message)
  revalidateReport(reportId)
}

// ─── Signature ───────────────────────────────────────────────────────────────

export async function saveSignature(dataUrl: string) {
  const { user, admin } = await requireUser()
  if (!dataUrl.startsWith('data:image/png;base64,')) throw new Error('Invalid signature image')
  if (dataUrl.length > 300_000) throw new Error('Signature image is too large')

  const { error } = await admin
    .from('profiles')
    .update({ signature_data_url: dataUrl })
    .eq('id', user.id)
  if (error) throw new Error(error.message)
  revalidatePath('/instructor/expenses')
}

// ─── Submit: generate PDF, email to accounting, lock the report ──────────────

export async function submitReport(reportId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const { user, admin } = await requireOwnedReport(reportId, { draftOnly: true })

  const { data: profile } = await admin
    .from('profiles')
    .select('first_name, last_name, email, signature_data_url')
    .eq('id', user.id)
    .single()

  const loaded = await loadReport(reportId)
  if (!loaded) return { ok: false, error: 'Report not found' }
  if (loaded.items.length === 0) return { ok: false, error: 'This report has no expenses — add at least one before submitting' }
  if (!loaded.report.reason?.trim() && !loaded.report.default_instance_id) {
    return { ok: false, error: 'Trip info is empty — fill in the reason for travel (or pick a course) and save it' }
  }
  if (!profile?.signature_data_url) {
    return { ok: false, error: 'No signature is saved on your profile — draw one in the Sign & submit section and tap "Save signature"' }
  }

  // Stamp submission time first so the PDF shows it.
  const submittedAt = new Date()
  loaded.pdfReport.submittedAt = submittedAt

  let pdfBytes: Uint8Array
  try {
    pdfBytes = await generateExpensePdf(loaded.pdfReport)
  } catch (e) {
    console.error('Expense report PDF generation failed:', e)
    return { ok: false, error: 'Could not generate the report PDF — nothing was submitted. Try again, and let admin know if it keeps failing.' }
  }
  const totals = computeTotals(loaded.pdfReport.items)
  const employeeName = loaded.pdfReport.employeeName
  const monthTag = submittedAt.toISOString().slice(0, 10)
  const pdfName = `Expense Report - ${employeeName} - ${monthTag}.pdf`

  // Email to accounting (best-effort attachments for receipts, capped).
  const to = process.env.EXPENSE_REPORT_TO || 'info@peak-rescue.com'
  if (process.env.RESEND_API_KEY) {
    try {
      const attachments: { filename: string; content: Buffer }[] = [
        { filename: pdfName, content: Buffer.from(pdfBytes) },
      ]
      let attached = 0
      let budget = MAX_EMAIL_ATTACHMENT_BYTES - pdfBytes.byteLength
      for (const r of loaded.receiptPaths) {
        const { data: blob } = await admin.storage.from(BUCKET).download(r.path)
        if (!blob) continue
        const buf = Buffer.from(await blob.arrayBuffer())
        if (buf.byteLength > budget) continue
        budget -= buf.byteLength
        attached++
        attachments.push({ filename: r.filename || r.path.split('/').pop() || 'receipt', content: buf })
      }

      const skipped = loaded.receiptPaths.length - attached
      const { Resend } = await import('resend')
      const resend = new Resend(process.env.RESEND_API_KEY)
      const { error: sendError } = await resend.emails.send({
        from: 'Peak Rescue Portal <noreply@peak-rescue.com>',
        to: [to],
        cc: profile?.email ? [profile.email] : undefined,
        replyTo: profile?.email ?? undefined,
        subject: `Expense report — ${employeeName} — ${fmtMoney(totals.total)}`,
        text: [
          `${employeeName} submitted an expense report through the portal.`,
          '',
          `Total: ${fmtMoney(totals.total)}`,
          `Due to employee (personal-paid): ${fmtMoney(totals.personal)}`,
          `Company card charges: ${fmtMoney(totals.companyCard)}`,
          loaded.report.reason ? `Reason for travel: ${loaded.report.reason}` : null,
          '',
          `The signed report PDF is attached${attached > 0 ? ` along with ${attached} receipt${attached === 1 ? '' : 's'}` : ''}.`,
          skipped > 0 ? `${skipped} receipt${skipped === 1 ? '' : 's'} exceeded the email size limit — view them in the portal.` : null,
        ].filter((l): l is string => l !== null).join('\n'),
        attachments,
      })
      if (sendError) throw new Error(sendError.message)
    } catch (e) {
      console.error('Expense report email failed:', e)
      return { ok: false, error: 'Could not send the report email — nothing was submitted. Try again.' }
    }
  }

  const { error } = await admin
    .from('expense_reports')
    .update({ status: 'submitted', submitted_at: submittedAt.toISOString() })
    .eq('id', reportId)
  if (error) return { ok: false, error: error.message }

  revalidateReport(reportId)
  return { ok: true }
}
