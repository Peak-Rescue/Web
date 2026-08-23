'use client'

import { useState } from 'react'
import InfoHint from '@/components/InfoHint'
import AttachmentFields from './AttachmentFields'
import type { UpdateLink, UpdateAttachment, UpdateAudience } from './update-actions'
import type { NotifyCounts } from '@/lib/course-notify'

const AUDIENCE_LABEL: Record<UpdateAudience, string> = {
  students: 'the students',
  instructors: 'the instructors',
  everyone: 'the course',
}

export type Draft = { body: string; links: UpdateLink[]; attachments: UpdateAttachment[]; audience: UpdateAudience }

// Writing an update: the message, plus links and files. Uploads go straight to
// the private bucket from the browser and only their paths reach the action.
export default function Composer({
  instanceId,
  busy,
  notifyCounts,
  submitLabel,
  initial,
  onSubmit,
  onCancel,
}: {
  instanceId: string
  busy: boolean
  notifyCounts: NotifyCounts
  submitLabel: string
  initial?: Draft
  onSubmit: (draft: Draft) => void
  onCancel?: () => void
}) {
  const [body, setBody] = useState(initial?.body ?? '')
  const [links, setLinks] = useState<UpdateLink[]>(initial?.links ?? [])
  const [attachments, setAttachments] = useState<UpdateAttachment[]>(initial?.attachments ?? [])
  // Held as two ticks rather than one three-way choice: "who is this for" is
  // two independent yes/nos in the writer's head, and both unticked is simply
  // not offered — the Post button goes dead instead.
  const [toStudents, setToStudents] = useState(initial ? initial.audience !== 'instructors' : true)
  const [toInstructors, setToInstructors] = useState(initial ? initial.audience !== 'students' : true)
  const audience: UpdateAudience =
    toStudents && toInstructors ? 'everyone' : toInstructors ? 'instructors' : 'students'
  const reach = toStudents || toInstructors ? notifyCounts[audience] : 0

  const empty = !body.trim() && links.length === 0 && attachments.length === 0
  const input = 'bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-sm focus:outline-none focus:border-zinc-500'

  return (
    <div className="p-3 bg-zinc-900 border border-zinc-800 rounded-lg space-y-2">
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={3}
        placeholder="e.g. Rain forecast Thursday — bring the drysuit, not the wetsuit."
        className={`w-full resize-y ${input}`}
      />

      <AttachmentFields
        instanceId={instanceId}
        links={links}
        setLinks={setLinks}
        attachments={attachments}
        setAttachments={setAttachments}
        trailing={
          /* Who it's for, beside the link and file icons rather than above the
             box — it's part of addressing the note, not a setting you go
             looking for. An instructors-only update is hidden from the students
             as well as unsent to them, which is why it says "sees" not "gets". */
          <span className="ml-auto flex items-center gap-3 text-[11px] text-zinc-500">
            <span className="text-zinc-600">Who sees it</span>
            <Tick label="Students" on={toStudents} set={setToStudents} />
            <Tick label="Instructors" on={toInstructors} set={setToInstructors} />
          </span>
        }
      />


      <div className="flex items-center gap-3 flex-wrap">
        <button
          onClick={() => onSubmit({ body, links, attachments, audience })}
          disabled={busy || empty || (!toStudents && !toInstructors)}
          className="px-3 py-1.5 rounded bg-pr-red hover:bg-pr-red-dark text-white text-sm font-medium transition-colors disabled:opacity-40"
        >
          {busy ? 'Working…' : submitLabel}
        </button>
        {onCancel && (
          <button onClick={onCancel} disabled={busy} className="text-xs text-zinc-500 hover:text-zinc-300">
            Cancel
          </button>
        )}
        {/* The line says what happens; the icon holds why you'd want it. The
            count is live state, not explanation, so it stays on screen. */}
        {!onCancel && (
          <span className="inline-flex items-center gap-1.5 text-xs text-zinc-500">
            {!toStudents && !toInstructors
              ? 'Tick who this is for.'
              : reach === 0
                ? `Nobody in ${AUDIENCE_LABEL[audience]} to email yet — posts to the course page only.`
                : `Emails ${reach === 1 ? '1 person' : `${reach} people`} a link to the course page.`}
            <InfoHint text="The email only points at the course page, so editing this later corrects what everyone sees. If it has to reach them tonight even without logging in, send an email instead." />
          </span>
        )}
      </div>
    </div>
  )
}

// One audience checkbox. No number beside it: the only count worth showing is
// how many inboxes the post reaches, and that already sits under the button as
// a sentence. A number here read as "how many people see it", which it wasn't —
// your own address is excluded, so it never matched the list of instructors
// further up the page.
function Tick({
  label, on, set,
}: {
  label: string
  on: boolean
  set: (v: boolean) => void
}) {
  return (
    <label className={`inline-flex items-center gap-1.5 cursor-pointer transition-colors ${on ? 'text-zinc-300' : 'hover:text-zinc-300'}`}>
      <input
        type="checkbox"
        checked={on}
        onChange={(e) => set(e.target.checked)}
        className="accent-pr-red w-3 h-3"
      />
      {label}
    </label>
  )
}
