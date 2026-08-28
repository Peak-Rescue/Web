'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { assignInstructor } from './actions'
import { sendInterestInvites, deleteInterestInvite } from './staffing-actions'
import TrashIcon from '@/components/TrashIcon'

export type InterestCandidate = {
  id: string
  name: string
  hasEmail: boolean
  qualified: boolean
  leadQualified: boolean
}

export type InterestInviteRow = {
  id: string
  instructorId: string
  name: string
  sentAt: string | null
  respondedAt: string | null
  interested: boolean | null
  note: string | null
  assigned: boolean
}

const fmtDay = (iso: string) =>
  new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

export default function StaffingInterest({
  instanceId,
  candidates,
  invites,
  hasLead,
  preselect = true,
}: {
  instanceId: string
  candidates: InterestCandidate[]
  invites: InterestInviteRow[]
  hasLead: boolean
  // Whether opening the picker starts with everyone qualified already ticked.
  // On a client course that's the usual intent. On an internal one, offering a
  // place is deliberate — who gets asked is the decision, so nobody is
  // pre-ticked and the "All qualified" button is one click away.
  preselect?: boolean
}) {
  const invitedIds = new Set(invites.map((i) => i.instructorId))
  const defaultSelection = () =>
    preselect
      ? new Set(candidates.filter((c) => c.qualified && c.hasEmail && !invitedIds.has(c.id)).map((c) => c.id))
      : new Set<string>()

  const [showPicker, setShowPicker] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(defaultSelection)
  const [busy, setBusy] = useState(false)
  const [assigningId, setAssigningId] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const router = useRouter()

  const interested = invites.filter((i) => i.interested === true)
  const declined = invites.filter((i) => i.interested === false)
  const awaiting = invites.filter((i) => i.interested === null)

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function selectLeadsOnly() {
    setSelected(new Set(candidates.filter((c) => c.leadQualified && c.hasEmail).map((c) => c.id)))
  }

  function selectQualified() {
    setSelected(new Set(candidates.filter((c) => c.qualified && c.hasEmail).map((c) => c.id)))
  }

  function selectAll() {
    setSelected(new Set(candidates.filter((c) => c.hasEmail).map((c) => c.id)))
  }

  async function send() {
    if (busy || selected.size === 0) return
    setBusy(true)
    setMessage(null)
    try {
      const result = await sendInterestInvites(instanceId, [...selected])
      setMessage(
        `Sent ${result.sent} invite${result.sent === 1 ? '' : 's'}` +
          (result.skipped.length ? ` — skipped ${result.skipped.join(', ')}` : '')
      )
      setShowPicker(false)
      router.refresh()
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Sending failed — please try again')
    } finally {
      setBusy(false)
    }
  }

  async function assign(instructorId: string, role: 'lead' | 'assist') {
    if (assigningId) return
    setAssigningId(instructorId)
    try {
      const fd = new FormData()
      fd.set('instructor_id', instructorId)
      fd.set('role', role)
      await assignInstructor(instanceId, fd)
      router.refresh()
    } finally {
      setAssigningId(null)
    }
  }

  async function removeInvite(inviteId: string) {
    await deleteInterestInvite(instanceId, inviteId)
    router.refresh()
  }

  // Qualified first, then the rest — mirrors the assign dropdown's grouping.
  const pickerRows = [...candidates].sort(
    (a, b) => Number(b.qualified) - Number(a.qualified) || a.name.localeCompare(b.name)
  )

  return (
    <div className="mt-2">
      {/* Styled identically to the guest-instructor button just above — the
          two are peer actions and should read that way. */}
      <button
        onClick={() => { setShowPicker((v) => !v); setMessage(null) }}
        className="inline-flex items-center text-xs px-2.5 py-1.5 rounded border border-zinc-700 text-zinc-300 hover:text-white hover:border-zinc-500 transition-colors"
      >
        {showPicker ? 'Close' : '+ Email instructors about this course'}
      </button>

      {message && <p className="mt-2 text-xs text-teal-300">{message}</p>}

      {showPicker && (
        <div className="mt-3 p-4 bg-zinc-900 border border-zinc-800 rounded-lg">
          <div className="flex items-center gap-2 mb-3 text-xs">
            <span className="text-zinc-500">Preselect:</span>
            <button onClick={selectQualified} className="px-2 py-0.5 rounded border border-zinc-700 text-zinc-400 hover:text-zinc-200 transition-colors">
              All qualified
            </button>
            <button onClick={selectLeadsOnly} className="px-2 py-0.5 rounded border border-zinc-700 text-zinc-400 hover:text-zinc-200 transition-colors">
              Lead-qualified only
            </button>
            <button onClick={selectAll} className="px-2 py-0.5 rounded border border-zinc-700 text-zinc-400 hover:text-zinc-200 transition-colors">
              All instructors
            </button>
          </div>
          <div className="space-y-1 max-h-64 overflow-y-auto pr-1">
            {pickerRows.map((c) => (
              <label
                key={c.id}
                className={`flex items-center gap-2.5 px-2 py-1.5 rounded text-sm ${
                  c.hasEmail ? 'cursor-pointer hover:bg-zinc-800/60' : 'opacity-50'
                }`}
              >
                <input
                  type="checkbox"
                  checked={selected.has(c.id)}
                  disabled={!c.hasEmail}
                  onChange={() => toggle(c.id)}
                  className="accent-red-600"
                />
                <span>{c.name}</span>
                {c.leadQualified ? (
                  <span className="text-[10px] text-teal-400">lead</span>
                ) : c.qualified ? (
                  <span className="text-[10px] text-blue-400">assist</span>
                ) : (
                  <span className="text-[10px] text-zinc-600">not qualified</span>
                )}
                {!c.hasEmail && <span className="text-[10px] text-zinc-600">no email</span>}
                {invitedIds.has(c.id) && <span className="text-[10px] text-zinc-500 ml-auto">already invited — will re-send</span>}
              </label>
            ))}
            {pickerRows.length === 0 && (
              <p className="text-xs text-zinc-500">Everyone is already assigned to this course.</p>
            )}
          </div>
          <button
            onClick={send}
            disabled={busy || selected.size === 0}
            className="mt-3 px-4 py-2 bg-pr-red hover:bg-pr-red-dark text-white rounded text-sm font-medium transition-colors disabled:opacity-40"
          >
            {busy ? 'Sending…' : `Email ${selected.size} instructor${selected.size === 1 ? '' : 's'}`}
          </button>
        </div>
      )}

      {invites.length > 0 && (
        <div className="mt-6 pt-5 border-t border-zinc-800/70">
          <div className="flex items-center gap-3 flex-wrap mb-3">
            <h3 className="text-sm font-medium text-zinc-400">Interest check</h3>
            <span className="text-xs text-zinc-500">
              {interested.length} interested · {declined.length} can&apos;t · {awaiting.length} awaiting reply
            </span>
          </div>
          <div className="space-y-2">
          {[...interested, ...awaiting, ...declined].map((inv) => (
            <div key={inv.id} className="px-4 py-2.5 bg-zinc-900 border border-zinc-800 rounded-lg">
              <div className="flex items-center gap-3 flex-wrap">
                <span className="font-medium text-sm">{inv.name}</span>
                <span
                  className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${
                    inv.interested === true
                      ? 'border-teal-700 bg-teal-900/30 text-teal-300'
                      : inv.interested === false
                        ? 'border-zinc-600 bg-zinc-800 text-zinc-400'
                        : 'border-yellow-800 bg-yellow-900/20 text-yellow-300/90'
                  }`}
                >
                  {inv.interested === true ? 'Interested' : inv.interested === false ? "Can't make it" : 'Awaiting reply'}
                </span>
                {inv.interested === null && inv.sentAt && (
                  <span className="text-xs text-zinc-600">sent {fmtDay(inv.sentAt)}</span>
                )}
                <div className="ml-auto flex items-center gap-2">
                  {inv.assigned ? (
                    <span className="text-xs text-teal-400">Assigned ✓</span>
                  ) : inv.interested === true ? (
                    <>
                      <button
                        onClick={() => assign(inv.instructorId, hasLead ? 'assist' : 'lead')}
                        disabled={assigningId !== null}
                        className="text-xs px-2.5 py-1 rounded bg-pr-red hover:bg-pr-red-dark text-white font-medium transition-colors disabled:opacity-40"
                      >
                        {assigningId === inv.instructorId ? 'Assigning…' : `Assign ${hasLead ? 'assist' : 'lead'}`}
                      </button>
                      <button
                        onClick={() => assign(inv.instructorId, hasLead ? 'lead' : 'assist')}
                        disabled={assigningId !== null}
                        className="text-xs px-2.5 py-1 rounded border border-zinc-700 hover:border-zinc-500 text-zinc-300 transition-colors disabled:opacity-40"
                      >
                        as {hasLead ? 'lead' : 'assist'}
                      </button>
                    </>
                  ) : null}
                  <button
                    onClick={() => removeInvite(inv.id)}
                    aria-label={`Remove invite for ${inv.name}`}
                    className="text-zinc-700 hover:text-red-400 transition-colors text-sm leading-none"
                  >
                    <TrashIcon />
                  </button>
                </div>
              </div>
              {inv.note && <p className="mt-1.5 text-xs text-zinc-400 italic">&ldquo;{inv.note}&rdquo;</p>}
            </div>
          ))}
          </div>
        </div>
      )}

    </div>
  )
}
