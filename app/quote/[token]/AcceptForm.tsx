'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { acceptQuote } from './actions'
import { fmtMoney } from '@/lib/expenses'
import { optionAvailable, selectionProblem, type QuoteOption } from '@/lib/quotes'

export default function AcceptForm({
  token,
  clientName,
  options,
}: {
  token: string
  clientName: string | null
  // Multi-option quotes: the client checks the option or options they want;
  // null = classic single-total quote, no picking involved.
  options: QuoteOption[] | null
}) {
  const [name, setName] = useState('')
  const [title, setTitle] = useState('')
  const [authorized, setAuthorized] = useState(false)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  // The same rule the accept action enforces, so the form never offers a
  // combination the server will turn down.
  const problem = options ? selectionProblem(options, [...selected]) : null
  const needsPick = Boolean(options) && selected.size === 0
  const selectedTotal = options
    ? [...selected].reduce((s, i) => s + Number(options[i]?.total ?? 0), 0)
    : 0

  // Unticking an option takes its additions with it — an addition cannot stand
  // alone, so leaving it checked would leave an invalid selection on screen for
  // the client to work out.
  function toggle(i: number) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(i)) {
        next.delete(i)
      } else {
        // Taking a course releases the other course: two of them is two
        // deployments, and greying the second out would leave the client to
        // work out which to untick first.
        if (options?.[i]?.relation === 'standalone') {
          for (let j = 0; j < options.length; j++) {
            if (j !== i && options[j]?.relation === 'standalone') next.delete(j)
          }
        }
        next.add(i)
      }
      // Whatever just moved, an addition left without the thing it is added to
      // goes with it.
      if (options) {
        for (let pass = 0; pass < options.length; pass++) {
          for (let j = 0; j < options.length; j++) {
            if (next.has(j) && !optionAvailable(options, j, next)) next.delete(j)
          }
        }
      }
      return next
    })
  }

  async function submit() {
    if (busy || !name.trim() || !authorized || needsPick || problem) return
    setBusy(true)
    setError(null)
    try {
      const result = await acceptQuote(token, { name, title, selected: options ? [...selected] : undefined })
      if (result.ok) {
        router.refresh()
      } else {
        setError(result.error)
      }
    } finally {
      setBusy(false)
    }
  }

  const inputCls =
    'w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2.5 text-sm text-white focus:outline-none focus:border-zinc-500'

  return (
    <div className="grid sm:grid-cols-2 gap-4">
      {options && (
        <div className="sm:col-span-2">
          <p className="text-xs text-zinc-400 mb-2">Select the option or options you&apos;d like to move forward with:</p>
          <div className="space-y-2">
            {options.map((o, i) => {
              // An addition is offered only once the option it belongs to is
              // taken: indented under it, and not tickable before. Disabled
              // rather than hidden, so the client can see what the first option
              // makes available rather than wondering where it went.
              const available = optionAvailable(options, i, selected)
              const isAddition = o.relation === 'addition' || Boolean(o.requires)
              const parentTitle = o.requires
                ? options.find((p) => p.estimate_id === o.requires)?.title ?? null
                : null
              const note = isAddition
                ? parentTitle
                  ? available ? `Added to ${parentTitle}` : `Available with ${parentTitle}`
                  : available ? 'Added to your selection' : 'Available with any option above'
                : null
              return (
                <label
                  key={i}
                  className={`flex items-center justify-between gap-3 px-4 py-3 rounded-lg border transition-colors ${
                    isAddition ? 'ml-6' : ''
                  } ${
                    !available
                      ? 'border-zinc-800 bg-zinc-900/60 opacity-60 cursor-not-allowed'
                      : selected.has(i)
                        ? 'border-pr-red bg-pr-red/10 cursor-pointer'
                        : 'border-zinc-700 bg-zinc-800/50 hover:border-zinc-500 cursor-pointer'
                  }`}
                >
                  <span className="flex items-center gap-3 min-w-0">
                    <input
                      type="checkbox"
                      checked={selected.has(i)}
                      disabled={!available}
                      onChange={() => toggle(i)}
                      className="accent-red-600 disabled:opacity-50"
                    />
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-white">{o.title}</span>
                      {note && <span className="block text-[11px] text-zinc-500">{note}</span>}
                    </span>
                  </span>
                  <span className="text-sm font-semibold text-white whitespace-nowrap">{fmtMoney(Number(o.total))}</span>
                </label>
              )
            })}
          </div>
          {selected.size > 0 && (
            <p className="mt-3 text-sm text-zinc-300 text-right">
              Selected total: <span className="font-semibold text-white">{fmtMoney(selectedTotal)}</span>
            </p>
          )}
        </div>
      )}
      <div>
        <label className="block text-xs text-zinc-400 mb-1.5">Full name</label>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" className={inputCls} />
      </div>
      <div>
        <label className="block text-xs text-zinc-400 mb-1.5">Title / role (optional)</label>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Operations SNCOIC" className={inputCls} />
      </div>
      <label className="sm:col-span-2 flex items-start gap-2.5 text-sm text-zinc-300 cursor-pointer">
        <input
          type="checkbox"
          checked={authorized}
          onChange={(e) => setAuthorized(e.target.checked)}
          className="accent-red-600 mt-0.5"
        />
        <span>
          I am authorized to accept this quote{clientName ? ` on behalf of ${clientName}` : ''} and would like to
          proceed with this training.
        </span>
      </label>
      {error && <p className="sm:col-span-2 text-sm text-red-400">{error}</p>}
      <div className="sm:col-span-2">
        <button
          onClick={submit}
          disabled={busy || !name.trim() || !authorized || needsPick}
          className="px-6 py-3 bg-pr-red hover:bg-pr-red-dark text-white rounded font-semibold transition-colors disabled:opacity-40"
        >
          {busy
            ? 'Submitting…'
            : options
              ? `Accept ${selected.size > 1 ? `${selected.size} options` : 'selected option'}`
              : 'Accept this quote'}
        </button>
        {needsPick && <p className="mt-2 text-xs text-zinc-500">Select at least one option above to accept.</p>}
      </div>
    </div>
  )
}
