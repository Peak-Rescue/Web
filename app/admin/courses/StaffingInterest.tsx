'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { assignInstructor } from './actions'
import { sendInterestInvites, deleteInterestInvite } from './staffing-actions'
import TrashIcon from '@/components/TrashIcon'
import type { StaffingConflicts } from '@/lib/courses'

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

// Lead and Assist are disjoint bands mirroring the badge on each row, so the
// filter and the list use one vocabulary; All leads as the master box over the
// lot, unqualified included. Ticking All fills the other two, unticking it
// clears everything, and dropping one band leaves All showing a dash.
const GROUPS: { label: string; match: (c: InterestCandidate) => boolean }[] = [
  { label: 'All', match: () => true },
  { label: 'Lead', match: (c) => c.leadQualified },
  { label: 'Assist', match: (c) => c.qualified && !c.leadQualified },
]

const fmtDay = (iso: string) =>
  new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

export default function StaffingInterest({
  instanceId,
  candidates,
  invites,
  hasLead,
  preselect = true,
  conflicts = {},
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
  /** Courses each instructor is already on that run on this course's days.
      Someone booked elsewhere is worth not emailing, and worth thinking twice
      about before assigning off the back of a reply — but they are still
      shown, and can still be picked. */
  conflicts?: StaffingConflicts
}) {
  const invitedIds = new Set(invites.map((i) => i.instructorId))
  const busyOn = (id: string) => conflicts[id] ?? []
  // Nobody double-booked is preselected — a mass email is the one place a
  // clash should cost nothing to respect, since not asking is free.
  const defaultSelection = () =>
    preselect
      ? new Set(candidates.filter((c) => c.qualified && c.hasEmail && !invitedIds.has(c.id) && busyOn(c.id).length === 0).map((c) => c.id))
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

  // A band means everyone in it, double-booked included — a box labelled Lead
  // that quietly holds back three leads is lying about what it ticked. The
  // amber "booked" flag on the row is how you spot them and untick by hand.
  // Only people with no address are left out, since they cannot be emailed.
  const group = (match: (c: InterestCandidate) => boolean) =>
    candidates.filter((c) => match(c) && c.hasEmail).map((c) => c.id)

  // Adds a box's people or takes them back out.
  const toggleGroup = (ids: string[], on: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev)
      for (const id of ids) { if (on) next.delete(id); else next.add(id) }
      return next
    })

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
  // Anyone already working these days sinks within their group, since they are
  // the least likely to be asked.
  const pickerRows = [...candidates].sort(
    (a, b) =>
      Number(b.qualified) - Number(a.qualified) ||
      Number(busyOn(a.id).length > 0) - Number(busyOn(b.id).length > 0) ||
      a.name.localeCompare(b.name)
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
          {/* One row above the list, its first tick in the same column as
              the rows below. */}
          <div className="flex items-center gap-4 px-2 py-1.5 mb-1 border-b border-zinc-800 text-sm">
            {GROUPS.map((g) => {
              const ids = group(g.match)
              const on = ids.length > 0 && ids.every((id) => selected.has(id))
              const some = !on && ids.some((id) => selected.has(id))
              return (
                <label key={g.label} className="flex items-center gap-2.5 cursor-pointer text-zinc-400 hover:text-zinc-200 transition-colors">
                  {/* `indeterminate` has no HTML attribute, so a ref callback
                      is the only way it survives the first paint. */}
                  <input
                    ref={(el) => { if (el) el.indeterminate = some }}
                    type="checkbox"
                    checked={on}
                    onChange={() => toggleGroup(ids, on)}
                    className="accent-red-600"
                  />
                  {g.label}
                </label>
              )
            })}
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
                {busyOn(c.id).map((k) => (
                  <span key={k.course} className="text-[10px] text-amber-400/90">booked {k.days}</span>
                ))}
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
              {!inv.assigned && busyOn(inv.instructorId).map((k) => (
                <p key={k.course} className="mt-1.5 text-xs text-amber-400/90">Already on {k.course} · {k.days}</p>
              ))}
              {inv.note && <p className="mt-1.5 text-xs text-zinc-400 italic">&ldquo;{inv.note}&rdquo;</p>}
            </div>
          ))}
          </div>
        </div>
      )}

    </div>
  )
}
