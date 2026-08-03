'use client'

import { useEffect, useRef, useState } from 'react'
import { LinkIcon, PencilIcon } from '@/components/TaskIcons'

// Attachment chip with inline rename — shared by CourseTasksPanel and
// MyTasksList. Rename/delete fire the parent's action runner, which owns
// busy/error state and refreshes the router.
export default function TaskDocChip({
  doc,
  canEdit,
  onRename,
  onDelete,
}: {
  doc: { id: string; filename: string; url: string; external?: boolean }
  canEdit: boolean
  onRename: (filename: string) => void
  onDelete: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const cancelled = useRef(false)

  useEffect(() => {
    if (editing) inputRef.current?.select()
  }, [editing])

  if (editing) {
    return (
      <span className="inline-flex items-center gap-1.5 px-2 py-1 bg-zinc-800 rounded text-xs">
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur()
            if (e.key === 'Escape') {
              cancelled.current = true
              e.currentTarget.blur()
            }
          }}
          onBlur={() => {
            const skip = cancelled.current
            cancelled.current = false
            setEditing(false)
            const name = draft.trim()
            if (!skip && name && name !== doc.filename) onRename(name)
          }}
          className="w-44 bg-zinc-900 border border-zinc-600 rounded px-1.5 py-0.5 text-xs text-zinc-200 focus:outline-none focus:border-zinc-400"
        />
      </span>
    )
  }

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-1 rounded text-xs ${
        doc.external ? 'bg-teal-500/10 border border-teal-500/30' : 'bg-zinc-800'
      }`}
    >
      {doc.external && <span className="text-teal-300"><LinkIcon /></span>}
      <a
        href={doc.url}
        target="_blank"
        rel="noreferrer"
        className={`max-w-44 truncate ${doc.external ? 'text-teal-300 hover:text-teal-100' : 'text-zinc-300 hover:text-white'}`}
      >
        {doc.filename}
      </a>
      {doc.external && <span className="text-teal-400/70" title="External link">↗</span>}
      {canEdit && (
        <>
          <button
            onClick={() => {
              setDraft(doc.filename)
              setEditing(true)
            }}
            title="Rename"
            className="text-zinc-500 hover:text-zinc-200 transition-colors"
          >
            <PencilIcon />
          </button>
          <button onClick={onDelete} title="Delete" className="text-zinc-500 hover:text-pr-red-light">
            ×
          </button>
        </>
      )}
    </span>
  )
}
