'use client'

import { useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import SignaturePad, { type SignaturePadHandle } from '@/components/SignaturePad'
import {
  type ExpenseCategory,
  type ExpenseRate,
  CATEGORY_LABELS,
  MEAL_CATEGORIES,
  categoriesFor,
  computeItem,
  computeTotals,
  daysInRange,
  fmtDateRange,
  fmtMoney,
} from '@/lib/expenses'
import {
  updateReportMeta,
  saveItem,
  deleteItem,
  deleteDraft,
  createReceiptUploadTargets,
  finalizeReceipts,
  deleteReceipt,
  submitReport,
  type ItemPayload,
} from '../actions'

export type EditorItem = {
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
  receipts: { id: string; filename: string; url: string }[]
}

export type CourseOption = { id: string; label: string }

type FormState = {
  category: ExpenseCategory
  start_date: string
  end_date: string
  paid_by: 'personal' | 'company_card'
  description: string
  details: string
  paid_for_others: boolean
  miles: string
  meal_count: string
  amount: string
  instance_id: string
}

const EMPTY_FORM: FormState = {
  category: 'transport',
  start_date: '',
  end_date: '',
  paid_by: 'personal',
  description: '',
  details: '',
  paid_for_others: false,
  miles: '',
  meal_count: '',
  amount: '',
  instance_id: '',
}

// Everything auto-saves: trip info and expense lines persist in the background
// a moment after the user stops typing (no save buttons). An expense line
// starts persisting once its required fields are filled; the status text in
// the form footer says which state it's in.
type SaveStatus = 'idle' | 'pending' | 'saving' | 'saved' | 'error'

const META_DEBOUNCE_MS = 700
const ITEM_DEBOUNCE_MS = 800

export default function ExpenseReportEditor({
  report,
  items,
  rates,
  courses,
  isExempt,
  hasSignature,
}: {
  report: { id: string; reason: string | null; default_instance_id: string | null }
  items: EditorItem[]
  rates: ExpenseRate[]
  courses: CourseOption[]
  isExempt: boolean
  hasSignature: boolean
}) {
  const router = useRouter()

  // Optimistic copy of the line items: saved/deleted lines show up instantly;
  // the server refresh reconciles in the background (receipt URLs, ordering).
  const [localItems, setLocalItems] = useState(items)
  const [syncedItems, setSyncedItems] = useState(items)
  if (syncedItems !== items) {
    setSyncedItems(items)
    setLocalItems(items)
  }

  function upsertLocalItem(next: EditorItem) {
    setLocalItems((prev) => {
      const existing = prev.find((i) => i.id === next.id)
      const merged = { ...next, receipts: existing?.receipts ?? next.receipts }
      const rest = prev.filter((i) => i.id !== next.id)
      return [...rest, merged].sort((a, b) => (a.start_date < b.start_date ? -1 : 1))
    })
  }

  // ── Trip info (auto-saved) ──────────────────────────────────────────────────
  const [reason, setReason] = useState(report.reason ?? '')
  const [defaultCourse, setDefaultCourse] = useState(report.default_instance_id ?? '')
  const [metaStatus, setMetaStatus] = useState<SaveStatus>('idle')
  const metaRef = useRef({ reason: report.reason ?? '', course: report.default_instance_id ?? '' })
  const metaSavedRef = useRef({ reason: report.reason ?? '', course: report.default_instance_id ?? '' })
  const metaTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  function changeMeta(nextReason: string, nextCourse: string) {
    setReason(nextReason)
    setDefaultCourse(nextCourse)
    metaRef.current = { reason: nextReason, course: nextCourse }
    setMetaStatus('pending')
    if (metaTimer.current) clearTimeout(metaTimer.current)
    metaTimer.current = setTimeout(() => void flushMeta(), META_DEBOUNCE_MS)
  }

  async function flushMeta() {
    if (metaTimer.current) {
      clearTimeout(metaTimer.current)
      metaTimer.current = null
    }
    const { reason: r, course: c } = metaRef.current
    if (r === metaSavedRef.current.reason && c === metaSavedRef.current.course) {
      setMetaStatus((s) => (s === 'pending' ? 'saved' : s))
      return
    }
    setMetaStatus('saving')
    try {
      await updateReportMeta(report.id, { reason: r || null, default_instance_id: c || null })
      metaSavedRef.current = { reason: r, course: c }
      // Re-check: user may have typed more while the request was in flight.
      if (metaRef.current.reason !== r || metaRef.current.course !== c) {
        metaTimer.current = setTimeout(() => void flushMeta(), META_DEBOUNCE_MS)
        setMetaStatus('pending')
      } else {
        setMetaStatus('saved')
      }
    } catch {
      setMetaStatus('error')
    }
  }

  // ── Expense line form (auto-saved once valid) ──────────────────────────────
  const [form, setForm] = useState<FormState | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null) // null = not yet persisted
  const [itemStatus, setItemStatus] = useState<SaveStatus>('idle')
  const [formError, setFormError] = useState<string | null>(null)
  const formRef = useRef<FormState | null>(null)
  const editingIdRef = useRef<string | null>(null)
  const itemTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const itemSaving = useRef(false)
  const itemRerun = useRef(false)

  const [stagedFiles, setStagedFiles] = useState<File[]>([])
  const stagedRef = useRef<File[]>([])
  const stagedInputRef = useRef<HTMLInputElement>(null)
  const [uploadingFor, setUploadingFor] = useState<string | null>(null)

  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [signatureSaved, setSignatureSaved] = useState(hasSignature)
  const [reviewOpen, setReviewOpen] = useState(false)
  const sigRef = useRef<SignaturePadHandle>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const uploadItemRef = useRef<string | null>(null)

  const categories = categoriesFor(isExempt)
  const totals = useMemo(() => computeTotals(localItems), [localItems])

  // What's still needed before this line can persist (empty array = valid).
  function missingFields(f: FormState): string[] {
    const missing: string[] = []
    if (!f.start_date) missing.push('a date')
    if (f.category === 'personal_auto') {
      if (!(Number(f.miles) > 0)) missing.push('miles')
    } else if (f.category === 'per_diem') {
      if (!(Number(f.meal_count) > 0)) missing.push('meals')
    } else if (f.amount === '') {
      missing.push('an amount')
    }
    if ((f.category === 'other' || f.paid_for_others) && !f.details.trim()) missing.push('details')
    return missing
  }

  function setFormAndSchedule(next: FormState) {
    setForm(next)
    formRef.current = next
    setFormError(null)
    setItemStatus('pending')
    if (itemTimer.current) clearTimeout(itemTimer.current)
    itemTimer.current = setTimeout(() => void flushItem(), ITEM_DEBOUNCE_MS)
  }

  function toPayload(f: FormState): ItemPayload {
    return {
      start_date: f.start_date,
      end_date: f.end_date || null,
      category: f.category,
      paid_by: f.paid_by,
      description: f.description || null,
      details: f.details || null,
      paid_for_others: f.paid_for_others,
      miles: f.miles ? Number(f.miles) : null,
      meal_count: f.meal_count ? Number(f.meal_count) : null,
      amount: f.amount ? Number(f.amount) : null,
      instance_id: f.instance_id || null,
    }
  }

  async function flushItem(): Promise<boolean> {
    if (itemTimer.current) {
      clearTimeout(itemTimer.current)
      itemTimer.current = null
    }
    const f = formRef.current
    if (!f) return true
    if (missingFields(f).length > 0) return true // stays 'pending' until required fields are in
    if (itemSaving.current) {
      itemRerun.current = true
      return true
    }
    itemSaving.current = true
    setItemStatus('saving')
    try {
      const saved = await saveItem(report.id, editingIdRef.current, toPayload(f))
      editingIdRef.current = saved.id
      setEditingId(saved.id)
      const computed = computeItem(
        {
          category: f.category,
          start_date: f.start_date,
          end_date: f.end_date || null,
          miles: f.miles ? Number(f.miles) : null,
          meal_count: f.meal_count ? Number(f.meal_count) : null,
          amount: f.amount ? Number(f.amount) : null,
        },
        rates
      )
      upsertLocalItem({
        id: saved.id,
        start_date: f.start_date,
        end_date: f.end_date || null,
        category: f.category,
        paid_by: f.paid_by,
        description: f.description || null,
        details: f.details || null,
        paid_for_others: f.paid_for_others,
        miles: f.category === 'personal_auto' && f.miles ? Number(f.miles) : null,
        meal_count: f.category === 'per_diem' && f.meal_count ? Number(f.meal_count) : null,
        amount: computed.amount,
        instance_id: f.instance_id || null,
        receipts: [],
      })
      if (stagedRef.current.length > 0) {
        const files = stagedRef.current
        stagedRef.current = []
        setStagedFiles([])
        await uploadReceipts(saved.id, files)
      }
      setItemStatus('saved')
      router.refresh()
      return true
    } catch (e) {
      setItemStatus('error')
      setFormError(e instanceof Error ? e.message : 'Could not save this line')
      return false
    } finally {
      itemSaving.current = false
      if (itemRerun.current) {
        itemRerun.current = false
        void flushItem()
      }
    }
  }

  // A save may be mid-flight when the user switches lines; let it settle so
  // its completion can't re-attach the editor to the item being closed out.
  async function waitForItemIdle() {
    while (itemSaving.current) {
      await new Promise((r) => setTimeout(r, 50))
    }
  }

  // Closes the line form. Auto-save means a valid line is already stored (or
  // will be by the flush here); an invalid half-filled one needs a confirm.
  async function closeForm(): Promise<boolean> {
    if (!formRef.current) return true
    await waitForItemIdle()
    const f = formRef.current
    if (!f) return true
    if (missingFields(f).length === 0) {
      if (!(await flushItem())) return false
    } else if (!editingIdRef.current) {
      const touched = JSON.stringify({ ...f, instance_id: '' }) !== JSON.stringify({ ...EMPTY_FORM })
      if (touched && !confirm(`This line is missing ${missingFields(f).join(' and ')} and won't be kept. Discard it?`)) {
        return false
      }
    } else if (!confirm(`Your latest edits are missing ${missingFields(f).join(' and ')} and won't be kept. Keep the last saved version?`)) {
      return false
    }
    setForm(null)
    formRef.current = null
    setEditingId(null)
    editingIdRef.current = null
    setItemStatus('idle')
    setFormError(null)
    setStagedFiles([])
    stagedRef.current = []
    return true
  }

  async function openAdd() {
    if (form && !(await closeForm())) return
    const blank = { ...EMPTY_FORM }
    setForm(blank)
    formRef.current = blank
    setEditingId(null)
    editingIdRef.current = null
    setItemStatus('idle')
    setFormError(null)
  }

  async function openEdit(item: EditorItem) {
    if (form && !(await closeForm())) return
    const f: FormState = {
      category: item.category,
      start_date: item.start_date,
      end_date: item.end_date ?? '',
      paid_by: item.paid_by,
      description: item.description ?? '',
      details: item.details ?? '',
      paid_for_others: item.paid_for_others,
      miles: item.miles?.toString() ?? '',
      meal_count: item.meal_count?.toString() ?? '',
      amount: item.amount ? item.amount.toString() : '',
      instance_id: item.instance_id ?? '',
    }
    setForm(f)
    formRef.current = f
    setEditingId(item.id)
    editingIdRef.current = item.id
    setItemStatus('saved')
    setFormError(null)
  }

  // Per diem: recompute meals (3/day) whenever the category or dates change.
  function withAutoMeals(f: FormState): FormState {
    if (f.category !== 'per_diem' || !f.start_date) return f
    return { ...f, meal_count: String(daysInRange(f.start_date, f.end_date || null) * 3) }
  }

  const preview = form
    ? computeItem(
        {
          category: form.category,
          start_date: form.start_date || new Date().toISOString().slice(0, 10),
          end_date: form.end_date || null,
          miles: form.miles ? Number(form.miles) : null,
          meal_count: form.meal_count ? Number(form.meal_count) : null,
          amount: form.amount ? Number(form.amount) : null,
        },
        rates
      )
    : null

  const isComputed = form && (form.category === 'personal_auto' || form.category === 'per_diem')
  const isMeal = form && MEAL_CATEGORIES.includes(form.category)
  const needsDetails = form && (form.category === 'other' || form.paid_for_others)
  const showDetails = form && (form.category === 'other' || form.category === 'per_diem' || form.paid_for_others)

  // ── Receipts ────────────────────────────────────────────────────────────────
  async function uploadReceipts(itemId: string, files: File[]) {
    const targets = await createReceiptUploadTargets(
      report.id,
      files.map((f) => ({ name: f.name, size: f.size }))
    )
    const supabase = createClient()
    const uploads: { path: string; filename: string }[] = []
    for (let i = 0; i < files.length; i++) {
      const { error } = await supabase.storage
        .from('expense-receipts')
        .uploadToSignedUrl(targets[i].path, targets[i].token, files[i], { contentType: files[i].type })
      if (error) throw new Error(`Upload failed for "${files[i].name}": ${error.message}`)
      uploads.push({ path: targets[i].path, filename: files[i].name })
    }
    await finalizeReceipts(report.id, itemId, uploads)
  }

  // Files picked inside the form: upload immediately if the line is already
  // saved; otherwise hold them and upload right after its first save.
  async function handleStagedFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    e.target.value = ''
    if (files.length === 0) return
    const itemId = editingIdRef.current
    if (itemId) {
      setUploadingFor(itemId)
      try {
        await uploadReceipts(itemId, files)
        router.refresh()
      } catch (err) {
        alert(err instanceof Error ? err.message : 'Receipt upload failed')
      } finally {
        setUploadingFor(null)
      }
    } else {
      const next = [...stagedRef.current, ...files]
      stagedRef.current = next
      setStagedFiles(next)
    }
  }

  function pickReceipts(itemId: string) {
    uploadItemRef.current = itemId
    fileInputRef.current?.click()
  }

  async function handleReceiptFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const itemId = uploadItemRef.current
    const files = Array.from(e.target.files ?? [])
    e.target.value = ''
    if (!itemId || files.length === 0) return
    setUploadingFor(itemId)
    try {
      await uploadReceipts(itemId, files)
      router.refresh()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Receipt upload failed')
    } finally {
      setUploadingFor(null)
    }
  }

  async function removeReceipt(receiptId: string) {
    setLocalItems((prev) =>
      prev.map((i) => ({ ...i, receipts: i.receipts.filter((r) => r.id !== receiptId) }))
    )
    await deleteReceipt(report.id, receiptId)
    router.refresh()
  }

  async function removeItem(itemId: string) {
    if (!confirm('Delete this expense?')) return
    setLocalItems((prev) => prev.filter((i) => i.id !== itemId))
    if (editingIdRef.current === itemId) {
      setForm(null)
      formRef.current = null
      setEditingId(null)
      editingIdRef.current = null
      setItemStatus('idle')
    }
    await deleteItem(report.id, itemId)
    router.refresh()
  }

  // ── Submit flow ─────────────────────────────────────────────────────────────
  // Flush every pending auto-save, then open the review dialog.
  async function openReview() {
    if (submitting) return
    setSubmitError(null)
    await flushMeta()
    await waitForItemIdle()
    if (formRef.current && missingFields(formRef.current).length === 0) await flushItem()
    await waitForItemIdle()
    const hasSig = (await sigRef.current?.saveIfDrawn()) ?? signatureSaved
    setSignatureSaved(hasSig)
    setReviewOpen(true)
  }

  async function confirmSubmit() {
    if (submitting) return
    setSubmitting(true)
    setSubmitError(null)
    try {
      const result = await submitReport(report.id)
      if (result.ok) {
        setReviewOpen(false)
        router.refresh()
      } else {
        setSubmitError(result.error)
      }
    } finally {
      setSubmitting(false)
    }
  }

  const tripInfoOk = Boolean(reason.trim() || defaultCourse)
  const receiptCount = localItems.reduce((s, i) => s + i.receipts.length, 0)

  const statusText: Record<SaveStatus, string> = {
    idle: '',
    pending: '…',
    saving: 'Saving…',
    saved: 'Saved ✓',
    error: 'Save failed',
  }
  const formMissing = form ? missingFields(form) : []

  const inputCls = 'w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-zinc-500'
  const labelCls = 'block text-xs text-zinc-400 mb-1'

  return (
    <main className="min-h-screen bg-zinc-950 text-white pt-16 md:pt-20">
      <div className="max-w-4xl mx-auto px-4 py-10">
        <Link href="/instructor/expenses" className="text-sm text-zinc-500 hover:text-zinc-300 transition-colors mb-6 inline-block">
          ← Expense Reports
        </Link>
        <div className="flex items-center gap-3 mb-8">
          <h1 className="text-2xl font-bold">Expense report</h1>
          <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-yellow-900/60 text-yellow-300">Draft</span>
          <span className="text-xs text-zinc-500">saves automatically</span>
        </div>

        {/* ── Trip info ── */}
        <section className="mb-8 p-6 bg-zinc-900 rounded-lg border border-zinc-800">
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Reason for travel</label>
              <input
                value={reason}
                onChange={(e) => changeMeta(e.target.value, defaultCourse)}
                placeholder="e.g. June rescue courses — Estes / Alamosa"
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>Course (default for all expenses)</label>
              <select value={defaultCourse} onChange={(e) => changeMeta(reason, e.target.value)} className={inputCls}>
                <option value="">— none / general —</option>
                {courses.map((c) => (
                  <option key={c.id} value={c.id}>{c.label}</option>
                ))}
              </select>
            </div>
          </div>
          <p className={`mt-3 text-xs h-4 ${metaStatus === 'error' ? 'text-pr-red-light' : 'text-zinc-500'}`}>
            {metaStatus === 'error' ? 'Could not save trip info — check your connection' : statusText[metaStatus]}
          </p>
        </section>

        {/* ── Expenses ── */}
        <section className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">Expenses</h2>
            <button
              onClick={() => void openAdd()}
              className="px-4 py-2 bg-pr-red hover:bg-pr-red-dark text-white rounded text-sm font-medium transition-colors"
            >
              Add expense
            </button>
          </div>

          {localItems.filter((i) => i.id !== editingId).length > 0 && (
            <div className="bg-zinc-900 rounded-lg border border-zinc-800 divide-y divide-zinc-800 mb-4">
              {localItems.filter((i) => i.id !== editingId).map((item) => (
                <div key={item.id} className="px-4 py-3">
                  <div className="flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">
                        {CATEGORY_LABELS[item.category]}
                        {item.description ? ` — ${item.description}` : ''}
                      </p>
                      <p className="text-xs text-zinc-500 mt-0.5">
                        {fmtDateRange(item.start_date, item.end_date)}
                        {item.category === 'personal_auto' && item.miles ? ` · ${item.miles} mi` : ''}
                        {item.category === 'per_diem' && item.meal_count ? ` · ${item.meal_count} meals` : ''}
                        {item.paid_by === 'company_card' ? ' · company card' : ''}
                      </p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="text-sm font-medium">{fmtMoney(item.amount)}</span>
                      <button onClick={() => void openEdit(item)} className="text-xs text-zinc-400 hover:text-white transition-colors">
                        Edit
                      </button>
                      <button onClick={() => void removeItem(item.id)} className="text-xs text-zinc-500 hover:text-pr-red-light transition-colors">
                        Delete
                      </button>
                    </div>
                  </div>
                  <div className="flex items-center flex-wrap gap-2 mt-2">
                    {item.receipts.map((r) => (
                      <span key={r.id} className="inline-flex items-center gap-1.5 px-2 py-1 bg-zinc-800 rounded text-xs">
                        <a href={r.url} target="_blank" rel="noreferrer" className="text-zinc-300 hover:text-white max-w-40 truncate">
                          {r.filename}
                        </a>
                        <button onClick={() => void removeReceipt(r.id)} className="text-zinc-500 hover:text-pr-red-light">×</button>
                      </span>
                    ))}
                    <button
                      onClick={() => pickReceipts(item.id)}
                      disabled={uploadingFor === item.id}
                      className="inline-flex items-center gap-1 px-2 py-1 border border-dashed border-zinc-700 hover:border-zinc-500 text-zinc-400 hover:text-zinc-200 rounded text-xs transition-colors disabled:opacity-50"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
                      </svg>
                      {uploadingFor === item.id ? 'Uploading…' : 'Add receipt'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
          {localItems.length === 0 && !form && (
            <p className="py-8 text-center text-sm text-zinc-500 border border-zinc-800 rounded-lg mb-4">
              No expenses yet — add your first one.
            </p>
          )}

          {/* Line form (auto-saving) */}
          {form && (
            <div className="p-6 bg-zinc-900 rounded-lg border border-zinc-700">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold">{editingId ? 'Expense' : 'New expense'}</h3>
                <span className={`text-xs ${itemStatus === 'error' ? 'text-pr-red-light' : itemStatus === 'saved' ? 'text-teal-400' : 'text-zinc-500'}`}>
                  {itemStatus === 'pending' && formMissing.length > 0
                    ? `add ${formMissing.join(' and ')} to save`
                    : statusText[itemStatus]}
                </span>
              </div>
              <div className="grid sm:grid-cols-3 gap-4">
                <div>
                  <label className={labelCls}>Category</label>
                  <select
                    value={form.category}
                    onChange={(e) => setFormAndSchedule(withAutoMeals({ ...form, category: e.target.value as ExpenseCategory, paid_for_others: false }))}
                    className={inputCls}
                  >
                    {categories.map((c) => (
                      <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Date</label>
                  <input type="date" value={form.start_date} onChange={(e) => setFormAndSchedule(withAutoMeals({ ...form, start_date: e.target.value }))} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>End date (optional)</label>
                  <input type="date" value={form.end_date} min={form.start_date || undefined} onChange={(e) => setFormAndSchedule(withAutoMeals({ ...form, end_date: e.target.value }))} className={inputCls} />
                </div>

                <div className="sm:col-span-2">
                  <label className={labelCls}>Description</label>
                  <input
                    value={form.description}
                    onChange={(e) => setFormAndSchedule({ ...form, description: e.target.value })}
                    placeholder={form.category === 'personal_auto' ? 'e.g. Fort Carson ↔ Estes, 2 trips' : 'What was this for?'}
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className={labelCls}>Paid with</label>
                  <select value={form.paid_by} onChange={(e) => setFormAndSchedule({ ...form, paid_by: e.target.value as FormState['paid_by'] })} className={inputCls}>
                    <option value="personal">Personal (reimburse me)</option>
                    <option value="company_card">Company card</option>
                  </select>
                </div>

                {form.category === 'personal_auto' && (
                  <div>
                    <label className={labelCls}>Total miles</label>
                    <input type="number" min="0" step="1" value={form.miles} onChange={(e) => setFormAndSchedule({ ...form, miles: e.target.value })} className={inputCls} />
                  </div>
                )}
                {form.category === 'per_diem' && (
                  <div>
                    <label className={labelCls}>Meals covered</label>
                    <input
                      type="number" min="0" step="1"
                      value={form.meal_count}
                      onChange={(e) => setFormAndSchedule({ ...form, meal_count: e.target.value })}
                      placeholder="pick dates above"
                      className={inputCls}
                    />
                    {form.start_date && (
                      <p className="mt-1 text-xs text-zinc-500">
                        {daysInRange(form.start_date, form.end_date || null)} day
                        {daysInRange(form.start_date, form.end_date || null) === 1 ? '' : 's'} × 3 meals — lower it if
                        you didn&apos;t take every meal
                      </p>
                    )}
                  </div>
                )}
                {!isComputed && (
                  <div>
                    <label className={labelCls}>Amount (USD)</label>
                    <input type="number" min="0" step="0.01" value={form.amount} onChange={(e) => setFormAndSchedule({ ...form, amount: e.target.value })} className={inputCls} />
                  </div>
                )}

                <div>
                  <label className={labelCls}>Course (overrides default)</label>
                  <select value={form.instance_id} onChange={(e) => setFormAndSchedule({ ...form, instance_id: e.target.value })} className={inputCls}>
                    <option value="">— report default —</option>
                    {courses.map((c) => (
                      <option key={c.id} value={c.id}>{c.label}</option>
                    ))}
                  </select>
                </div>

                {isMeal && (
                  <div className="flex items-end pb-2">
                    <label className="flex items-center gap-2 text-sm text-zinc-300">
                      <input
                        type="checkbox"
                        checked={form.paid_for_others}
                        onChange={(e) => setFormAndSchedule({ ...form, paid_for_others: e.target.checked })}
                        className="accent-red-600"
                      />
                      Paid for others
                    </label>
                  </div>
                )}

                {showDetails && (
                  <div className="sm:col-span-3">
                    <label className={labelCls}>
                      Details{needsDetails ? ' (required)' : ''}
                      {form.paid_for_others ? ' — who was included?' : form.category === 'other' ? ' — what is this expense?' : ''}
                    </label>
                    <textarea
                      value={form.details}
                      onChange={(e) => setFormAndSchedule({ ...form, details: e.target.value })}
                      rows={2}
                      className={`${inputCls} resize-y`}
                    />
                  </div>
                )}

                <div className="sm:col-span-3">
                  <label className={labelCls}>Receipts</label>
                  <div className="flex items-center flex-wrap gap-2">
                    {editingId &&
                      localItems.find((i) => i.id === editingId)?.receipts.map((r) => (
                        <span key={r.id} className="inline-flex items-center gap-1.5 px-2 py-1 bg-zinc-800 rounded text-xs">
                          <a href={r.url} target="_blank" rel="noreferrer" className="text-zinc-300 hover:text-white max-w-40 truncate">
                            {r.filename}
                          </a>
                          <button onClick={() => void removeReceipt(r.id)} className="text-zinc-500 hover:text-pr-red-light">×</button>
                        </span>
                      ))}
                    {stagedFiles.map((f, i) => (
                      <span key={`${f.name}-${i}`} className="inline-flex items-center gap-1.5 px-2 py-1 bg-zinc-800 rounded text-xs text-zinc-300">
                        <span className="max-w-40 truncate">{f.name}</span>
                        <button
                          type="button"
                          onClick={() => {
                            const next = stagedFiles.filter((_, j) => j !== i)
                            setStagedFiles(next)
                            stagedRef.current = next
                          }}
                          className="text-zinc-500 hover:text-pr-red-light"
                        >
                          ×
                        </button>
                      </span>
                    ))}
                    <button
                      type="button"
                      onClick={() => stagedInputRef.current?.click()}
                      disabled={uploadingFor === editingId && editingId !== null}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-dashed border-zinc-600 hover:border-zinc-400 text-zinc-400 hover:text-zinc-200 rounded text-xs font-medium transition-colors disabled:opacity-50"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
                      </svg>
                      {uploadingFor && uploadingFor === editingId ? 'Uploading…' : 'Add receipt photo / PDF'}
                    </button>
                    <input
                      ref={stagedInputRef}
                      type="file"
                      accept="image/*,.pdf"
                      multiple
                      className="hidden"
                      onChange={handleStagedFiles}
                    />
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between mt-5">
                <div className="text-sm">
                  {isComputed && preview && (
                    <span className="text-zinc-400">
                      {form.category === 'personal_auto'
                        ? `${form.miles || 0} mi × ${preview.rate_used === null ? '—' : fmtMoney(preview.rate_used)}/mi = `
                        : `${form.meal_count || 0} meals × ${preview.rate_used === null ? '—' : fmtMoney(preview.rate_used)} = `}
                      <span className="font-semibold text-white">{fmtMoney(preview.amount)}</span>
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {formError && <span className="text-xs text-pr-red-light mr-2">{formError}</span>}
                  <button
                    onClick={() => void closeForm()}
                    className="px-4 py-2 text-zinc-400 hover:text-zinc-200 text-sm transition-colors"
                  >
                    Done
                  </button>
                  <button
                    onClick={() => void openAdd()}
                    className="px-4 py-2 bg-pr-red hover:bg-pr-red-dark text-white rounded text-sm font-medium transition-colors"
                  >
                    Add another expense
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Totals */}
          {localItems.length > 0 && (
            <div className="flex justify-between items-end gap-8 text-sm px-4 mt-4">
              <p className="text-xs text-zinc-500">
                <span className="text-teal-400">✓</span> Everything saves automatically. You can leave and finish
                later; nothing is sent until you submit.
              </p>
              <div className="text-right space-y-1 shrink-0">
                <p className="text-zinc-400">Company card: {fmtMoney(totals.companyCard)}</p>
                <p className="text-zinc-400">Personal-paid (reimbursed): {fmtMoney(totals.personal)}</p>
                <p className="font-semibold text-base">Total: {fmtMoney(totals.total)}</p>
              </div>
            </div>
          )}
        </section>

        {/* ── Signature + submit ── */}
        <section className="mb-8">
          <h2 className="text-lg font-semibold mb-4">Sign &amp; submit</h2>
          <div className="space-y-4">
            <SignaturePad ref={sigRef} hasSignature={signatureSaved} onSaved={() => setSignatureSaved(true)} />
            <div className="flex items-center justify-between p-4 bg-zinc-900 border border-zinc-800 rounded-lg">
              <p className="text-xs text-zinc-500 max-w-md">
                Submitting certifies these expenses are business related and properly reimbursable. The signed
                PDF{receiptCount > 0 ? ' and receipts are' : ' is'}{' '}sent to your supervisor for approval. You&apos;ll review
                everything before it goes out.
              </p>
              <button
                onClick={() => void openReview()}
                disabled={submitting || localItems.length === 0}
                className="px-5 py-2.5 bg-pr-red hover:bg-pr-red-dark text-white rounded text-sm font-semibold transition-colors disabled:opacity-50 shrink-0"
              >
                Review &amp; submit
              </button>
            </div>
            {submitError && !reviewOpen && <p className="text-sm text-pr-red-light">{submitError}</p>}
          </div>
        </section>

        {/* ── Review-before-submit modal ── */}
        {reviewOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={() => !submitting && setReviewOpen(false)}>
            <div
              className="w-full max-w-2xl bg-zinc-900 border border-zinc-700 rounded-lg p-6 max-h-[85vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-lg font-semibold mb-1">Review before submitting</h3>
              <p className="text-xs text-zinc-500 mb-4">
                {tripInfoOk ? (reason.trim() || courses.find((c) => c.id === defaultCourse)?.label) : 'Untitled report'} ·
                goes to your supervisor for approval · can&apos;t be edited after submitting.
              </p>

              {/* Anything blocking submission, called out specifically. */}
              {(items.length === 0 || !tripInfoOk || !signatureSaved) && (
                <div className="space-y-1.5 mb-4 text-sm text-pr-red-light">
                  {localItems.length === 0 && <p>✗ No expenses added yet</p>}
                  {!tripInfoOk && <p>✗ Trip info is empty — fill in the reason for travel or pick a course</p>}
                  {!signatureSaved && <p>✗ No signature saved — draw one in the Sign &amp; submit section</p>}
                </div>
              )}

              {/* The line items exactly as they'll appear on the report. */}
              {localItems.length > 0 && (
                <div className="border border-zinc-800 rounded-lg divide-y divide-zinc-800 mb-3">
                  {localItems.map((item) => (
                    <div key={item.id} className="px-3 py-2 flex items-center justify-between gap-3 text-sm">
                      <div className="min-w-0">
                        <p className="truncate">
                          {CATEGORY_LABELS[item.category]}
                          {item.description ? ` — ${item.description}` : ''}
                        </p>
                        <p className="text-xs text-zinc-500">
                          {fmtDateRange(item.start_date, item.end_date)}
                          {item.category === 'personal_auto' && item.miles ? ` · ${item.miles} mi` : ''}
                          {item.category === 'per_diem' && item.meal_count ? ` · ${item.meal_count} meals` : ''}
                          {item.paid_by === 'company_card' ? ' · company card' : ''}
                          {item.receipts.length > 0 ? ` · ${item.receipts.length} receipt${item.receipts.length === 1 ? '' : 's'}` : ''}
                        </p>
                      </div>
                      <span className="font-medium shrink-0">{fmtMoney(item.amount)}</span>
                    </div>
                  ))}
                  <div className="px-3 py-2 flex items-center justify-between text-sm bg-zinc-950/40">
                    <span className="text-zinc-400">
                      Total · {fmtMoney(totals.personal)} reimbursed to you
                      {receiptCount > 0 ? ` · ${receiptCount} receipt${receiptCount === 1 ? '' : 's'} attached` : ''}
                    </span>
                    <span className="font-semibold">{fmtMoney(totals.total)}</span>
                  </div>
                </div>
              )}

              <a
                href={`/instructor/expenses/${report.id}/pdf`}
                target="_blank"
                rel="noreferrer"
                className="inline-block mb-5 text-sm text-zinc-300 underline hover:text-white transition-colors"
              >
                View the exact PDF that will be sent →
              </a>

              {submitError && <p className="text-sm text-pr-red-light mb-4">{submitError}</p>}

              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setReviewOpen(false)}
                  disabled={submitting}
                  className="px-4 py-2 text-zinc-400 hover:text-zinc-200 text-sm transition-colors"
                >
                  Back to editing
                </button>
                <button
                  onClick={() => void confirmSubmit()}
                  disabled={submitting || localItems.length === 0 || !signatureSaved || !tripInfoOk}
                  className="px-5 py-2.5 bg-pr-red hover:bg-pr-red-dark text-white rounded text-sm font-semibold transition-colors disabled:opacity-50"
                >
                  {submitting ? 'Submitting…' : 'Submit report'}
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="mt-16 pt-8 border-t border-zinc-800 flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-zinc-400">Delete draft</p>
            <p className="text-xs text-zinc-600 mt-0.5">Removes this draft and its receipts. Cannot be undone.</p>
          </div>
          <DeleteDraftButton reportId={report.id} />
        </div>

        <input ref={fileInputRef} type="file" accept="image/*,.pdf" multiple onChange={handleReceiptFiles} className="hidden" />
      </div>
    </main>
  )
}

function DeleteDraftButton({ reportId }: { reportId: string }) {
  const [busy, setBusy] = useState(false)
  return (
    <button
      onClick={async () => {
        if (busy || !confirm('Delete this draft report?')) return
        setBusy(true)
        try {
          await deleteDraft(reportId)
        } catch {
          setBusy(false)
        }
      }}
      disabled={busy}
      className="px-4 py-2 text-sm font-medium text-pr-red-light hover:text-white hover:bg-pr-red rounded border border-pr-red/40 transition-colors disabled:opacity-50"
    >
      {busy ? 'Deleting…' : 'Delete draft'}
    </button>
  )
}
