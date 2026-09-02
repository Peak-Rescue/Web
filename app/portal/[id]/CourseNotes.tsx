'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { saveCourseNotes } from './notes-actions'
import CloseButton from '@/components/CloseButton'
import ComposerTrigger, { NoteIcon } from '@/components/ComposerTrigger'

// Internal notes: read as a block, edited in place. Nothing here is emailed
// and nobody outside the team can see it, so there's no confirmation step —
// the risk of a typo is smaller than the risk of the note never being written.
//
// Bullets are a plain "- " at the front of the line, not a rich-text format.
// The same string is the body of the Google Calendar event, so whatever shape
// it has here has to survive being read in Calendar, in the admin editor's
// bare textarea, and in a phone notification — a dash does, markup wouldn't.

const BULLET = /^(\s*)[-*•]\s+(.*)$/

type Block =
  | { kind: 'list'; items: string[] }
  | { kind: 'text'; lines: string[] }

// Runs of bullet lines become one list; everything else stays as typed.
function parseNotes(text: string): Block[] {
  const blocks: Block[] = []
  for (const line of text.split('\n')) {
    const bullet = BULLET.exec(line)
    const last = blocks[blocks.length - 1]
    if (bullet) {
      if (last?.kind === 'list') last.items.push(bullet[2])
      else blocks.push({ kind: 'list', items: [bullet[2]] })
    } else {
      if (last?.kind === 'text') last.lines.push(line)
      else blocks.push({ kind: 'text', lines: [line] })
    }
  }
  // A blank line between paragraph and list is spacing the blocks already
  // give us; keeping it would double the gap.
  return blocks.map((b) =>
    b.kind === 'text' ? { kind: 'text' as const, lines: trimBlank(b.lines) } : b,
  ).filter((b) => b.kind === 'list' || b.lines.length > 0)
}

function trimBlank(lines: string[]) {
  let start = 0
  let end = lines.length
  while (start < end && lines[start].trim() === '') start++
  while (end > start && lines[end - 1].trim() === '') end--
  return lines.slice(start, end)
}

export function NotesBody({ notes }: { notes: string }) {
  return (
    <div className="space-y-3">
      {parseNotes(notes).map((block, i) =>
        block.kind === 'list' ? (
          <ul key={i} className="space-y-1">
            {block.items.map((item, j) => (
              <li key={j} className="flex gap-2">
                <span aria-hidden className="text-zinc-500 select-none">•</span>
                <span className="flex-1 whitespace-pre-wrap">{item}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p key={i} className="whitespace-pre-wrap">{block.lines.join('\n')}</p>
        ),
      )}
    </div>
  )
}

export default function CourseNotes({
  instanceId,
  notes,
  canEdit,
}: {
  instanceId: string
  notes: string | null
  canEdit: boolean
}) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(notes ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const textarea = useRef<HTMLTextAreaElement>(null)

  async function save() {
    setBusy(true); setError(null)
    try {
      await saveCourseNotes(instanceId, draft)
      setEditing(false)
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That didn’t save')
    } finally {
      setBusy(false)
    }
  }

  // Writing a list shouldn't mean typing the dash every time. Enter inside a
  // bullet starts the next one; Enter on a bullet you never filled in ends the
  // list, which is how every notes app behaves and how you stop without
  // reaching for the mouse.
  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key !== 'Enter' || e.shiftKey) return
    const el = e.currentTarget
    const { selectionStart, selectionEnd, value } = el
    if (selectionStart !== selectionEnd) return
    const lineStart = value.lastIndexOf('\n', selectionStart - 1) + 1
    const bullet = BULLET.exec(value.slice(lineStart, selectionStart))
    if (!bullet) return
    e.preventDefault()
    if (bullet[2].trim() === '') {
      replace(el, lineStart, selectionStart, '')
    } else {
      replace(el, selectionStart, selectionStart, `\n${bullet[1]}- `)
    }
  }

  // Toggling from the button covers the other half: turning three lines you
  // already wrote into three bullets, and taking them back off.
  function toggleBullets() {
    const el = textarea.current
    if (!el) return
    const { selectionStart, selectionEnd, value } = el
    const start = value.lastIndexOf('\n', selectionStart - 1) + 1
    const nextBreak = value.indexOf('\n', selectionEnd)
    const end = nextBreak === -1 ? value.length : nextBreak
    const lines = value.slice(start, end).split('\n')
    const allBullets = lines.every((l) => l.trim() === '' || BULLET.test(l))
    const next = lines.map((l) => {
      if (l.trim() === '') return l
      const bullet = BULLET.exec(l)
      if (allBullets && bullet) return bullet[1] + bullet[2]
      return bullet ? l : `- ${l}`
    })
    replace(el, start, end, next.join('\n'))
  }

  // Written through the element so the browser keeps the undo stack — a
  // setState-only edit makes ⌘Z wipe the whole note instead of the bullet.
  function replace(el: HTMLTextAreaElement, from: number, to: number, text: string) {
    el.focus()
    el.setSelectionRange(from, to)
    if (!document.execCommand('insertText', false, text)) {
      const value = el.value.slice(0, from) + text + el.value.slice(to)
      el.value = value
      el.setSelectionRange(from + text.length, from + text.length)
    }
    setDraft(el.value)
  }

  if (editing) {
    return (
      <div className="p-3 bg-zinc-900 border border-zinc-700 rounded-lg space-y-2">
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={toggleBullets}
            disabled={busy}
            title="Bullet the selected lines"
            className="inline-flex items-center gap-1.5 rounded border border-zinc-700 px-2 py-1 text-[11px] text-zinc-300 hover:text-white hover:border-zinc-500 transition-colors disabled:opacity-40"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M8 6h13M8 12h13M8 18h13" />
              <path d="M3 6h.01M3 12h.01M3 18h.01" />
            </svg>
            Bullets
          </button>
          <CloseButton
            label="Cancel"
            disabled={busy}
            onClick={() => { setDraft(notes ?? ''); setError(null); setEditing(false) }}
          />
        </div>
        <textarea
          autoFocus
          ref={textarea}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          rows={6}
          placeholder={'Gate codes, client quirks, what to watch for.\nStart a line with "- " for a bullet.'}
          className="w-full resize-y bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-sm text-zinc-200 focus:outline-none focus:border-zinc-500"
        />
        {error && <p className="text-xs text-pr-red">{error}</p>}
        <div className="flex items-center gap-3">
          <button
            onClick={save}
            disabled={busy}
            className="px-3 py-1.5 rounded bg-pr-red hover:bg-pr-red-dark text-white text-sm font-medium transition-colors disabled:opacity-40"
          >
            {busy ? 'Saving…' : 'Save notes'}
          </button>

        </div>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {notes && (
        <div className="p-4 bg-zinc-900 border border-zinc-800 rounded-lg text-sm text-zinc-300">
          <NotesBody notes={notes} />
        </div>
      )}
      {/* Nothing written yet reads as the same invitation the composers give:
          one row that looks like the field it opens. With a note already here
          the row would be a second box under the first, so it steps down to
          the pencil every other edit on this page uses. */}
      {canEdit && !notes && (
        <ComposerTrigger label="Add notes" icon={<NoteIcon />} onClick={() => setEditing(true)} />
      )}
      {canEdit && notes && (
        <button
          onClick={() => setEditing(true)}
          className="inline-flex items-center gap-1.5 rounded border border-zinc-700 px-2 py-1 text-[11px] text-zinc-300 hover:text-white hover:border-zinc-500 transition-colors"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M12 20h9" />
            <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
          </svg>
          Edit notes
        </button>
      )}
    </div>
  )
}
