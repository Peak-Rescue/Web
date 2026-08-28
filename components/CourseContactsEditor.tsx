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

// Editable POC list for a course form. Renders one POC (name/phone/email) by
// default; "+" buttons reveal extra phone/email lines or a whole extra POC.
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

  const cleaned = pocs
    .map((p) => ({
      name: p.name.trim(),
      phones: p.phones.map((s) => s.trim()).filter(Boolean),
      emails: p.emails.map((s) => s.trim()).filter(Boolean),
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
              <label className="block text-xs text-zinc-400">
                {i === 0 ? 'Point of contact' : `POC ${i + 1}`}
              </label>
              <span className="flex items-center gap-1.5">
                {i > 0 && (
                  <button
                    type="button"
                    title="Remove this POC"
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
                    onClick={() => update((n) => void n.push({ name: '', phones: [''], emails: [''] }))}
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
    </div>
  )
}
