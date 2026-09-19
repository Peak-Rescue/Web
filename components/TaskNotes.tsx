'use client'

import { useLayoutEffect, useRef, useState } from 'react'
import { Linkified } from '@/lib/linkify'

// Task notes are plain text in the database, but the text people actually
// write is a list: three things to chase, two of them done. These two pieces
// keep that readable at both ends — the field continues a list as you type,
// and the view renders one back as bullets and tick boxes. Nothing here
// changes the stored value beyond the characters you can see.

const CHECK = /^(\s*)[-*]\s+\[([ xX])\]\s?(.*)$/
const BULLET = /^(\s*)([-*•])\s+(.*)$/
const NUMBER = /^(\s*)(\d+)([.)])\s+(.*)$/

type Line =
  | { kind: 'check'; indent: string; done: boolean; text: string }
  | { kind: 'bullet'; indent: string; text: string }
  | { kind: 'number'; indent: string; n: number; text: string }
  | { kind: 'plain'; text: string }

function parseLine(line: string): Line {
  const check = CHECK.exec(line)
  if (check) return { kind: 'check', indent: check[1], done: check[2] !== ' ', text: check[3] }
  const bullet = BULLET.exec(line)
  if (bullet) return { kind: 'bullet', indent: bullet[1], text: bullet[3] }
  const num = NUMBER.exec(line)
  if (num) return { kind: 'number', indent: num[1], n: Number(num[2]), text: num[4] }
  return { kind: 'plain', text: line }
}

// The marker a new line should start with to carry this one's list on, or ''
// when the line is an empty list item — pressing Enter there ends the list
// rather than laying down another empty bullet.
function continuation(line: Line): string | null {
  switch (line.kind) {
    case 'check':
      return line.text.trim() ? `${line.indent}- [ ] ` : ''
    case 'bullet':
      return line.text.trim() ? `${line.indent}- ` : ''
    case 'number':
      return line.text.trim() ? `${line.indent}${line.n + 1}. ` : ''
    default:
      return null
  }
}

// Whatever list marker the line already carries comes off first, so the
// buttons swap a bullet for a tick box instead of stacking one on the other.
function stripMarker(line: string): string {
  return parseLine(line).text
}

function withMarker(line: string, marker: 'bullet' | 'check'): string {
  const body = stripMarker(line)
  return marker === 'check' ? `- [ ] ${body}` : `- ${body}`
}

/** A notes editor that shows the notes, not their markup: tick boxes are
    real boxes you can tick, bullets are bullets, and clicking the text opens
    the plain-text box to type in. It grows with what is in it — notes are a
    running list, and a three-line window onto a nine-line list hides the
    half you have not done. */
export function TaskNotesField({
  value,
  onChange,
  rows = 3,
  placeholder,
  disabled = false,
  highlight = false,
  ref,
}: {
  value: string
  onChange: (next: string) => void
  rows?: number
  placeholder?: string
  disabled?: boolean
  highlight?: boolean
  ref?: React.Ref<HTMLTextAreaElement>
}) {
  const [editing, setEditing] = useState(false)
  const innerRef = useRef<HTMLTextAreaElement>(null)

  // Nothing written yet has nothing to render, so the box is the only view.
  const typing = (editing || !value.trim()) && !disabled

  // Height follows the text: no inner scrollbar, no list cut off at line
  // three. Reset to auto first or it can only ever grow.
  useLayoutEffect(() => {
    const el = innerRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [value, typing])

  // The parent owns the value, so the caret has to be put back by hand after
  // every edit we make on its behalf.
  function edit(next: string, caret: number) {
    onChange(next)
    requestAnimationFrame(() => {
      const el = innerRef.current
      if (!el) return
      el.focus()
      el.setSelectionRange(caret, caret)
    })
  }

  // Opens the text box at a given point — clicking a line puts you on that
  // line rather than at the end of everything.
  function startTyping(caret = value.length) {
    setEditing(true)
    requestAnimationFrame(() => {
      const el = innerRef.current
      if (!el) return
      el.focus()
      el.setSelectionRange(caret, caret)
    })
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key !== 'Enter' || e.shiftKey || e.metaKey || e.ctrlKey || e.altKey) return
    const el = e.currentTarget
    const { selectionStart: start, selectionEnd: end } = el
    if (start !== end) return
    const lineStart = value.lastIndexOf('\n', start - 1) + 1
    const current = value.slice(lineStart, start)
    const marker = continuation(parseLine(current))
    if (marker === null) return
    e.preventDefault()
    if (marker === '') {
      // Empty item: clear the marker and leave a blank line behind.
      const next = `${value.slice(0, lineStart)}\n${value.slice(start)}`
      edit(next, lineStart + 1)
      return
    }
    const next = `${value.slice(0, start)}\n${marker}${value.slice(start)}`
    edit(next, start + 1 + marker.length)
  }

  // Applies to every line the selection touches, so a pasted block becomes a
  // list in one go. On an empty line it lays the marker down and leaves the
  // caret after it — you click the button and start typing the first item,
  // rather than having to write the line before you can mark it.
  function applyMarker(kind: 'bullet' | 'check') {
    const el = innerRef.current
    if (!el) return startTyping()
    const start = value.lastIndexOf('\n', el.selectionStart - 1) + 1
    const endIdx = value.indexOf('\n', el.selectionEnd)
    const end = endIdx === -1 ? value.length : endIdx
    const lines = value.slice(start, end).split('\n')
    const marker = kind === 'check' ? '- [ ] ' : '- '

    if (lines.length === 1 && !lines[0].trim()) {
      edit(value.slice(0, start) + marker + value.slice(end), start + marker.length)
      return
    }

    // Pressing the button a second time on the same lines takes the list off.
    const written = lines.filter((l) => l.trim())
    const already = written.every((l) => parseLine(l).kind === kind)
    const block = lines
      .map((l) => (!l.trim() ? l : already ? stripMarker(l) : withMarker(l, kind)))
      .join('\n')
    const next = value.slice(0, start) + block + value.slice(end)
    edit(next, start + block.length)
  }

  const btn =
    'px-2 py-1 rounded text-xs text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors disabled:opacity-40'

  return (
    <div>
      {!disabled && (
        <div className="flex items-center gap-1 mb-1">
          {/* mousedown is where focus leaves the box; holding it here keeps
              the caret where the marker is about to land. */}
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => applyMarker('bullet')}
            className={btn}
            title="Bullet list"
          >
            • List
          </button>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => applyMarker('check')}
            className={btn}
            title="Checklist"
          >
            ☐ Checklist
          </button>
          {typing && value.trim() && (
            <button type="button" onClick={() => setEditing(false)} className={`${btn} ml-auto`}>
              Done
            </button>
          )}
        </div>
      )}
      {typing ? (
        <textarea
          ref={(el) => {
            innerRef.current = el
            if (typeof ref === 'function') ref(el)
            else if (ref) (ref as React.RefObject<HTMLTextAreaElement | null>).current = el
          }}
          value={value}
          rows={rows}
          // A floor, not a ceiling: an empty field still looks like somewhere
          // to write, and the effect above takes it up from there.
          style={{ minHeight: `${rows * 1.5}rem` }}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          onBlur={() => setEditing(false)}
          className={`w-full bg-zinc-800 border rounded px-3 py-2 text-sm focus:outline-none resize-none overflow-hidden ${
            highlight ? 'border-pr-red-light ring-1 ring-pr-red-light' : 'border-zinc-700 focus:border-zinc-500'
          }`}
        />
      ) : (
        <div
          className={`w-full bg-zinc-800/40 border rounded px-3 py-2 ${
            disabled ? 'border-zinc-800' : 'border-zinc-700 hover:border-zinc-600 cursor-text'
          } ${highlight ? 'border-pr-red-light ring-1 ring-pr-red-light' : ''}`}
          onClick={(e) => {
            // A tick box is an answer, not an invitation to retype the line —
            // only clicking the words opens the editor.
            if (disabled) return
            if ((e.target as HTMLElement).closest('input, a')) return
            const line = (e.target as HTMLElement).closest('[data-line]')
            const index = line ? Number((line as HTMLElement).dataset.line) : null
            startTyping(index === null ? value.length : caretAtEndOfLine(value, index))
          }}
        >
          <TaskNotesView text={value} onToggle={disabled ? undefined : onChange} />
        </div>
      )}
    </div>
  )
}

/** Where the caret goes when you click line `index` — the end of that line. */
function caretAtEndOfLine(text: string, index: number): number {
  const lines = text.split('\n')
  return lines.slice(0, index + 1).join('\n').length
}

/** Notes as everyone else sees them: bullets indented, tick boxes drawn, URLs
    live, blank lines kept. Pass `onToggle` to let the reader tick a box —
    it returns the whole note back with that one line flipped. */
export function TaskNotesView({ text, onToggle }: { text: string; onToggle?: (next: string) => void }) {
  const lines = text.split('\n')

  function toggle(index: number) {
    if (!onToggle) return
    const parsed = parseLine(lines[index])
    if (parsed.kind !== 'check') return
    const next = [...lines]
    next[index] = `${parsed.indent}- [${parsed.done ? ' ' : 'x'}] ${parsed.text}`
    onToggle(next.join('\n'))
  }

  return (
    <div className="text-sm text-zinc-300 space-y-0.5">
      {lines.map((raw, i) => {
        const line = parseLine(raw)
        if (line.kind === 'check') {
          return (
            <label
              key={i}
              data-line={i}
              className={`flex items-start gap-2 ${onToggle ? 'cursor-pointer' : ''}`}
              style={{ paddingLeft: line.indent.length * 8 }}
            >
              <input
                type="checkbox"
                checked={line.done}
                disabled={!onToggle}
                onChange={() => toggle(i)}
                className="accent-teal-600 size-3.5 mt-0.5 shrink-0 disabled:opacity-60"
              />
              <span className={line.done ? 'text-zinc-500 line-through' : ''}>
                <Linkified text={line.text} />
              </span>
            </label>
          )
        }
        if (line.kind === 'bullet' || line.kind === 'number') {
          return (
            <div key={i} data-line={i} className="flex items-start gap-2" style={{ paddingLeft: line.indent.length * 8 }}>
              <span className="text-zinc-500 shrink-0">{line.kind === 'bullet' ? '•' : `${line.n}.`}</span>
              <span>
                <Linkified text={line.text} />
              </span>
            </div>
          )
        }
        // A blank line is spacing the writer asked for; keep it visible.
        if (!line.text.trim()) return <div key={i} data-line={i} className="h-2" />
        return (
          <p key={i} data-line={i} className="whitespace-pre-wrap">
            <Linkified text={line.text} />
          </p>
        )
      })}
    </div>
  )
}
