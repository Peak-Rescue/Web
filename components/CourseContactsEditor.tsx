'use client'

import { useRef, useState } from 'react'
import type { CoursePOC } from '@/lib/contacts'
import TrashIcon from '@/components/TrashIcon'

const inputCls =
  'w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-zinc-500'
const miniBtnCls =
  'px-1.5 text-xs leading-5 text-zinc-500 hover:text-white border border-zinc-700 hover:border-zinc-500 rounded transition-colors shrink-0'
const removeBtnCls =
  'px-1.5 text-xs leading-5 text-zinc-500 hover:text-red-400 border border-zinc-700 hover:border-red-400 rounded transition-colors shrink-0'

function ListField({
  label,
  type,
  values,
  onEdit,
  onAdd,
  onRemove,
}: {
  label: string
  type: string
  values: string[]
  onEdit: (idx: number, value: string) => void
  onAdd: () => void
  onRemove: (idx: number) => void
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <label className="block text-xs text-zinc-400">{label}</label>
        <button type="button" title={`Add another ${label.toLowerCase()}`} onClick={onAdd} className={miniBtnCls}>
          +
        </button>
      </div>
      <div className="space-y-2">
        {values.map((v, j) => (
          <div key={j} className="flex items-center gap-1.5">
            <input type={type} value={v} onChange={(e) => onEdit(j, e.target.value)} className={inputCls} />
            {j > 0 && (
              <button type="button" title={`Remove this ${label.toLowerCase()}`} onClick={() => onRemove(j)} className={removeBtnCls}>
                <TrashIcon />
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

// The billing contact is named, not numbered: "POC 3" tells you where someone
// sits in a list, which is the one thing about them that does not matter.
// Numbering counts only the ordinary POCs, so removing the billing row never
// renumbers the people above it.
function labelFor(pocs: CoursePOC[], i: number) {
  if (pocs[i].role === 'billing') return 'Billing contact'
  const nth = pocs.slice(0, i).filter((p) => p.role !== 'billing').length
  return nth === 0 ? 'Point of contact' : `POC ${nth + 1}`
}

// Editable POC list for a course form. Renders one POC (name/phone/email) by
// default; "+" buttons reveal extra phone/email lines or a whole extra POC.
//
// One of them can be the billing contact — the person invoiced, who is
// usually not the person who booked. It is the same row with a different
// label, so marking a POC you already typed is a click rather than a retype.
// "+ Billing" hides itself once there is one, which is the whole of the "if
// different" condition: the button is only there while it can still be true.
// State is serialized into a hidden contacts_json input, so it works in both
// the plain create form and AutoSaveForm (typing bubbles input events; line
// removals dispatch one manually so the auto-save notices).
export default function CourseContactsEditor({ initial }: { initial: CoursePOC[] }) {
  const [pocs, setPocs] = useState<CoursePOC[]>(() =>
    (initial.length ? initial : [{ name: '', phones: [], emails: [] }]).map((p) => ({
      name: p.name,
      phones: p.phones.length ? p.phones : [''],
      emails: p.emails.length ? p.emails : [''],
    }))
  )
  const hiddenRef = useRef<HTMLInputElement>(null)
  const hasBilling = pocs.some((p) => p.role === 'billing')

  const cleaned = pocs
    .map((p) => ({
      name: p.name.trim(),
      phones: p.phones.map((s) => s.trim()).filter(Boolean),
      emails: p.emails.map((s) => s.trim()).filter(Boolean),
      ...(p.role ? { role: p.role } : {}),
    }))
    .filter((p) => p.name || p.phones.length || p.emails.length)

  function update(mut: (next: CoursePOC[]) => void, opts?: { notify?: boolean }) {
    setPocs((prev) => {
      const next = structuredClone(prev)
      mut(next)
      return next
    })
    if (opts?.notify) {
      // Wait a tick so the hidden input re-renders with the new value first.
      queueMicrotask(() => hiddenRef.current?.dispatchEvent(new Event('input', { bubbles: true })))
    }
  }

  return (
    <div className="sm:col-span-2 space-y-4">
      <input ref={hiddenRef} type="hidden" name="contacts_json" value={JSON.stringify(cleaned)} readOnly />
      {pocs.map((p, i) => (
        <div key={i} className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-start">
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs text-zinc-400">{labelFor(pocs, i)}</label>
              <span className="flex items-center gap-1.5">
                {(i > 0 || p.role === 'billing') && (
                  <button
                    type="button"
                    title={p.role === 'billing' ? 'Remove the billing contact' : 'Remove this POC'}
                    onClick={() => update((n) => void n.splice(i, 1), { notify: true })}
                    className={removeBtnCls}
                  >
                    <TrashIcon />
                  </button>
                )}
                {i === pocs.length - 1 && (
                  <button
                    type="button"
                    title="Add another POC"
                    // Inserted above the billing contact, which stays last:
                    // it is the end of the list in the same sense that it is
                    // the end of the job.
                    onClick={() =>
                      update((n) => {
                        const at = n.findIndex((c) => c.role === 'billing')
                        n.splice(at === -1 ? n.length : at, 0, { name: '', phones: [''], emails: [''] })
                      })
                    }
                    className={miniBtnCls}
                  >
                    + POC
                  </button>
                )}
              </span>
            </div>
            <input
              value={p.name}
              placeholder="Name"
              onChange={(e) => update((n) => void (n[i].name = e.target.value))}
              className={inputCls}
            />
          </div>
          <ListField
            label="Phone"
            type="tel"
            values={p.phones}
            onEdit={(j, v) => update((n) => void (n[i].phones[j] = v))}
            onAdd={() => update((n) => void n[i].phones.push(''))}
            onRemove={(j) => update((n) => void n[i].phones.splice(j, 1), { notify: true })}
          />
          <ListField
            label="Email"
            type="email"
            values={p.emails}
            onEdit={(j, v) => update((n) => void (n[i].emails[j] = v))}
            onAdd={() => update((n) => void n[i].emails.push(''))}
            onRemove={(j) => update((n) => void n[i].emails.splice(j, 1), { notify: true })}
          />
        </div>
      ))}

      {/* The rule stated where the list is, rather than discovered at the
          handover. Invoices follow the point of contact, which is right on
          nearly every course; the exception is a real one — accounts payable
          is often a different human — and it is one sentence and one click
          away instead of a button abbreviated to "+ Billing" in a row of
          icons. Once there is a billing contact the row above says so in its
          own label, so the sentence retires rather than repeating itself. */}
      {!hasBilling && (
        <p className="text-xs text-zinc-500">
          Invoices go to the point of contact.{' '}
          <button
            type="button"
            onClick={() =>
              update((n) => void n.push({ name: '', phones: [''], emails: [''], role: 'billing' }), { notify: true })
            }
            className="underline underline-offset-2 decoration-zinc-600 hover:text-zinc-300 transition-colors"
          >
            Someone else pays?
          </button>
        </p>
      )}
    </div>
  )
}
