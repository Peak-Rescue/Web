'use client'

import { useEffect, useState } from 'react'

// Shown after files are picked but before they upload: one row per file with
// an editable display name (pre-filled with the original filename). The parent
// owns the actual upload and passes `uploading` to lock the controls.
export default function UploadNameDialog({
  files,
  uploading,
  onSubmit,
  onCancel,
}: {
  files: File[]
  uploading: boolean
  onSubmit: (names: string[]) => void
  onCancel: () => void
}) {
  const [names, setNames] = useState<string[]>(() => files.map((f) => f.name))

  // A fresh pick replaces the list — reset the drafts to match, during render
  // (React's "adjust state when a prop changes" pattern, no effect needed).
  const [prevFiles, setPrevFiles] = useState(files)
  if (files !== prevFiles) {
    setPrevFiles(files)
    setNames(files.map((f) => f.name))
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !uploading) onCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [uploading, onCancel])

  if (files.length === 0) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={() => !uploading && onCancel()}
    >
      <div
        className="w-full max-w-md bg-zinc-900 border border-zinc-700 rounded-lg p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-sm font-semibold text-zinc-200 mb-1">
          Name {files.length === 1 ? 'this file' : `these ${files.length} files`}
        </h3>
        <p className="text-xs text-zinc-500 mb-4">
          Give each file a clear name — this is what everyone on the course sees.
        </p>

        <div className="space-y-3 max-h-72 overflow-y-auto">
          {files.map((f, i) => (
            <div key={i}>
              <input
                autoFocus={i === 0}
                value={names[i] ?? ''}
                disabled={uploading}
                onChange={(e) =>
                  setNames((prev) => {
                    const next = [...prev]
                    next[i] = e.target.value
                    return next
                  })
                }
                onFocus={(e) => e.currentTarget.select()}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') onSubmit(names)
                }}
                className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-zinc-500 disabled:opacity-50"
              />
              <p className="mt-0.5 text-[11px] text-zinc-600 truncate">{f.name}</p>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-3 mt-5">
          <button
            onClick={() => onSubmit(names)}
            disabled={uploading}
            className="px-4 py-2 bg-pr-red hover:bg-pr-red-dark text-white rounded text-sm font-medium transition-colors disabled:opacity-50"
          >
            {uploading ? 'Uploading…' : 'Upload'}
          </button>
          <button
            onClick={onCancel}
            disabled={uploading}
            className="px-3 py-2 text-zinc-400 hover:text-zinc-200 text-sm disabled:opacity-50"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
