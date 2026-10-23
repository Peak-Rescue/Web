'use client'

import { useRef } from 'react'

// The three ways something gets onto a course: off the shelf, as a link, as
// a file.
//
// Every block that takes material had grown its own pair or trio — "Choose
// from the library" and "Add a map", "Add venue material" and "Add a link",
// two bare icons on Files, "Find one" and "Add one" on the MEDEVAC banner —
// for the same acts in a different order with different words. One component
// now, so the next block to need them cannot invent a fourth phrasing.
//
// Each is optional: a map has no file to upload, and a block that cannot
// reach the library does not pretend to.

const BOOK = (
  <>
    <path d="M2 4h6a3 3 0 0 1 3 3v13a2.5 2.5 0 0 0-2.5-2.5H2z" />
    <path d="M22 4h-6a3 3 0 0 0-3 3v13a2.5 2.5 0 0 1 2.5-2.5H22z" />
  </>
)
const LINK = (
  <>
    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
  </>
)
const UPLOAD = (
  <>
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <path d="m17 8-5-5-5 5" />
    <path d="M12 3v12" />
  </>
)

const Icon = ({ children }: { children: React.ReactNode }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="13"
    height="13"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.75"
    strokeLinecap="round"
    strokeLinejoin="round"
    className="shrink-0"
  >
    {children}
  </svg>
)

const button =
  'inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded border border-dashed border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-zinc-200 transition-colors disabled:opacity-40'

export default function AddButtons({
  onFromLibrary,
  onAddLink,
  onAddFile,
  noun = 'file',
  disabled,
  className = '',
}: {
  onFromLibrary?: () => void
  onAddLink?: () => void
  /** Given, an upload button appears and hands the files straight over. */
  onAddFile?: (files: FileList) => void
  /** What a new one is called here — "map", "file", "document". */
  noun?: string
  disabled?: boolean
  className?: string
}) {
  const fileRef = useRef<HTMLInputElement>(null)

  return (
    <div className={`flex items-center gap-2 flex-wrap ${className}`}>
      {onFromLibrary && (
        <button type="button" onClick={onFromLibrary} disabled={disabled} className={button}>
          <Icon>{BOOK}</Icon>
          Add from library
        </button>
      )}
      {onAddLink && (
        <button type="button" onClick={onAddLink} disabled={disabled} className={button}>
          <Icon>{LINK}</Icon>
          Add new link
        </button>
      )}
      {onAddFile && (
        <>
          <button type="button" onClick={() => fileRef.current?.click()} disabled={disabled} className={button}>
            <Icon>{UPLOAD}</Icon>
            Add new {noun}
          </button>
          <input
            ref={fileRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => {
              const files = e.target.files
              e.target.value = ''
              if (files?.length) onAddFile(files)
            }}
          />
        </>
      )}
    </div>
  )
}
