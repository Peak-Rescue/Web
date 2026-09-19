'use client'

import { useRef, useState } from 'react'
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

/** A notes editor: multi-line, with list continuation on Enter, buttons for
    bullets and tick boxes, and a preview where the boxes can be ticked. Used
    both where a task is created and where it is edited, so what you type in
    one place reads the same in the other. */
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
  const [previewing, setPreviewing] = useState(false)
  const innerRef = useRef<HTMLTextAreaElement>(null)

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
  // list in one go.
  function applyMarker(kind: 'bullet' | 'check') {
    const el = innerRef.current
    if (!el) return
    const start = value.lastIndexOf('\n', el.selectionStart - 1) + 1
    const endIdx = value.indexOf('\n', el.selectionEnd)
    const end = endIdx === -1 ? value.length : endIdx
    const block = value
      .slice(start, end)
      .split('\n')
      .map((l) => (l.trim() ? withMarker(l, kind) : l))
      .join('\n')
    const next = value.slice(0, start) + block + value.slice(end)
    edit(next, start + block.length)
  }

  const btn =
    'px-2 py-1 rounded text-xs text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors disabled:opacity-40'

  return (
    <div>
      <div className="flex items-center gap-1 mb-1">
        <button type="button" onClick={() => applyMarker('bullet')} disabled={disabled || previewing} className={btn} title="Bullet list">
          • List
        </button>
        <button type="button" onClick={() => applyMarker('check')} disabled={disabled || previewing} className={btn} title="Checklist">
          ☐ Checklist
        </button>
        {value.trim() && (
          <button type="button" onClick={() => setPreviewing((p) => !p)} className={`${btn} ml-auto`}>
            {previewing ? 'Edit' : 'Preview'}
          </button>
        )}
      </div>
      {previewing ? (
        <div className="min-h-16 bg-zinc-800/40 border border-zinc-800 rounded px-3 py-2">
          <TaskNotesView text={value} onToggle={disabled ? undefined : onChange} />
        </div>
      ) : (
        <textarea
          ref={(el) => {
            innerRef.current = el
            if (typeof ref === 'function') ref(el)
            else if (ref) (ref as React.RefObject<HTMLTextAreaElement | null>).current = el
          }}
          value={value}
          disabled={disabled}
          rows={rows}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          className={`w-full bg-zinc-800 border rounded px-3 py-2 text-sm focus:outline-none resize-y disabled:opacity-50 ${
            highlight ? 'border-pr-red-light ring-1 ring-pr-red-light' : 'border-zinc-700 focus:border-zinc-500'
          }`}
        />
      )}
    </div>
  )
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
            <div key={i} className="flex items-start gap-2" style={{ paddingLeft: line.indent.length * 8 }}>
              <span className="text-zinc-500 shrink-0">{line.kind === 'bullet' ? '•' : `${line.n}.`}</span>
              <span>
                <Linkified text={line.text} />
              </span>
            </div>
          )
        }
        // A blank line is spacing the writer asked for; keep it visible.
        if (!line.text.trim()) return <div key={i} className="h-2" />
        return (
          <p key={i} className="whitespace-pre-wrap">
            <Linkified text={line.text} />
          </p>
        )
      })}
    </div>
  )
}
