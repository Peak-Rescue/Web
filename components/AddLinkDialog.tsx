'use client'

import { useEffect, useState } from 'react'
import { type LibraryAudience } from '@/lib/library'
import FilingFields, { type FilingValue } from '@/components/FilingFields'
import { libraryFilingOptions } from '@/app/admin/courses/resource-actions'

/** What the panel starts from: what the dialog already knows, and nothing
    assumed about the rest. */
const blankFiling = (kind: string, title: string): FilingValue => ({
  title,
  url: '',
  kind,
  note: '',
  course_types: [],
  audience: 'internal',
  place: '',
  client_id: null,
  disciplines: [],
  topicsRaw: '',
})
import KindOptions from '@/components/KindOptions'
import { AudienceChoice } from '@/components/AudienceToggle'

// Modal for attaching an external link (Google Drive, Dropbox, CalTopo…)
// alongside file uploads — used by the course Files section and task
// attachments. The parent owns the save and passes `busy` to lock controls.
// Where the link has an audience (photo albums), `withAudience` asks for it
// here: who it's for is part of adding it, not a setting to find afterwards.
// `libraryPlace` does the same for reuse — naming a Maui med plan is the moment
// you know it belongs to Maui, not something to remember on a later screen.
export default function AddLinkDialog({
  open,
  busy,
  withAudience = false,
  libraryPlace = null,
  onSubmit,
  onCancel,
  defaultKind,
  defaultToLibrary,
  onUpload,
}: {
  open: boolean
  busy: boolean
  withAudience?: boolean
  // The venue or region this course sits in, when it has one. It names the
  // place on the offer; it no longer gates it. A course with no venue yet
  // still has documents worth keeping, and hiding the only path to the
  // library until somebody sets a place is how a med plan ends up pasted
  // onto one course and nowhere else.
  libraryPlace?: string | null
  /** Pre-ticked and pre-typed, where the thing being added is already known —
      the MEDEVAC banner opens this asking for a MEDEVAC plan. */
  defaultKind?: string
  defaultToLibrary?: boolean
  /** Where a file is as good an answer as a link. Given, the dialog offers
      both; withheld, it is a link dialog — a map is a CalTopo URL and there
      is no file to upload. The caller does the uploading; this only asks. */
  onUpload?: (files: FileList, kind: string, audience: LibraryAudience) => void
  /** `kind` is only meaningful when the link is also being filed; `filing`
      carries the rest of what the library asks — where it is about, whose it
      is, which offerings — when the person said to file it. */
  onSubmit: (
    name: string,
    url: string,
    audience: LibraryAudience,
    toLibrary: boolean,
    kind: string,
    filing?: FilingValue
  ) => void
  onCancel: () => void
}) {
  const [name, setName] = useState('')
  const [url, setUrl] = useState('')
  // Null until asked and answered. Dialogs that don't ask (photos, task files)
  // fall back to instructors-only on submit, as they always did.
  const [audience, setAudience] = useState<LibraryAudience | null>(null)
  const [toLibrary, setToLibrary] = useState(Boolean(defaultToLibrary))
  // Asked only when it is being filed, because it is the filing's question.
  // A link added to a course and nowhere else is whatever it is; one going
  // into the library under a place has to say whether it is that place's med
  // plan, its evac plan, its permit — or it lands as untyped reference and
  // reads nowhere near where it belongs.
  const [kind, setKind] = useState(defaultKind ?? 'reference')
  // Fetched the first time somebody says to file it, rather than loaded onto
  // every course page for the one time in ten it is wanted.
  const [options, setOptions] = useState<Awaited<ReturnType<typeof libraryFilingOptions>> | null>(null)
  const [filing, setFiling] = useState<FilingValue | null>(null)
  useEffect(() => {
    if (!toLibrary || options) return
    let live = true
    libraryFilingOptions().then((o) => { if (live) setOptions(o) }).catch(() => {})
    return () => { live = false }
  }, [toLibrary, options])
  // The type and the name keep coming from the fields above, so the panel is
  // never asking for either of them twice.
  useEffect(() => {
    setFiling((f) => (f ? { ...f, kind, title: name } : f))
  }, [kind, name])

  // Reopening starts a fresh link — reset the drafts during render
  // (React's "adjust state when a prop changes" pattern, no effect needed).
  const [prevOpen, setPrevOpen] = useState(open)
  if (open !== prevOpen) {
    setPrevOpen(open)
    setName('')
    setUrl('')
    setAudience(null)
    // Back to what the caller opened it with, not to blank: the MEDEVAC
    // banner opens this asking for a MEDEVAC plan, and resetting to "no"
    // would undo the thing the button was for.
    setToLibrary(Boolean(defaultToLibrary))
    setKind(defaultKind ?? 'reference')
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !busy) onCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [busy, onCancel])

  if (!open) return null

  // Where the audience is asked, it is required — an unanswered question must
  // not resolve itself into the more restrictive answer behind your back.
  const canSubmit = !busy && url.trim().length > 0 && (!withAudience || audience !== null)
  const submit = () =>
    canSubmit && onSubmit(name, url, audience ?? 'internal', toLibrary, kind, toLibrary ? filing ?? undefined : undefined)

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={() => !busy && onCancel()}
    >
      <div
        className="w-full max-w-md bg-zinc-900 border border-zinc-700 rounded-lg p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-sm font-semibold text-zinc-200 mb-1">
          {onUpload ? 'Add something new' : 'Add a link'}
        </h3>
        <p className="text-xs text-zinc-500 mb-4">
          {onUpload
            ? 'A link to where it already lives, or the file itself.'
            : 'Google Drive, Dropbox, CalTopo — wherever it already lives.'}
        </p>

        <label className="block text-xs text-zinc-500 mb-1">Link</label>
        <input
          autoFocus
          value={url}
          disabled={busy}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          placeholder="https://drive.google.com/…"
          className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-zinc-500 disabled:opacity-50"
        />

        <label className="block text-xs text-zinc-500 mt-3 mb-1">Name</label>
        <input
          value={name}
          disabled={busy}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          placeholder="What everyone on the course sees — e.g. Packing list"
          className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-zinc-500 disabled:opacity-50"
        />

        {withAudience && (
          <>
            <label className="block text-xs text-zinc-500 mt-3 mb-1.5">Who can see it</label>
            <AudienceChoice audience={audience} onChange={setAudience} disabled={busy} />
          </>
        )}

        <label className="flex items-center gap-2.5 mt-3 px-3 py-2.5 rounded border border-zinc-700 bg-zinc-800/50 hover:border-zinc-600 text-sm text-zinc-200 cursor-pointer transition-colors">
            <input
              type="checkbox"
              checked={toLibrary}
              disabled={busy}
              onChange={(e) => setToLibrary(e.target.checked)}
              className="accent-red-600 w-4 h-4 shrink-0 disabled:opacity-50"
            />
            <span>
              Add to the library
              {libraryPlace && <> for <span className="font-medium">{libraryPlace}</span></>}
            </span>
          </label>

        {/* The other way in, in the same dialog. Two buttons on the section
            for "a link" and "a file" made the choice before the question —
            what is being added is one thing, and how it arrives is a detail
            of it. */}
        {onUpload && (
          <label className="flex items-center justify-between gap-3 mt-3 px-3 py-2.5 rounded border border-dashed border-zinc-700 hover:border-zinc-500 text-sm text-zinc-300 cursor-pointer transition-colors">
            <span>Or upload the file itself</span>
            <input
              type="file"
              multiple
              disabled={busy}
              className="hidden"
              onChange={(e) => {
                const files = e.target.files
                e.target.value = ''
                if (files?.length) onUpload(files, kind, audience ?? 'internal')
              }}
            />
            <span className="text-xs text-zinc-500 shrink-0">Choose…</span>
          </label>
        )}

        {/* The library's own filing panel, not a cut-down version of it.
            Ticking the box used to ask one question — what is it — and file
            the rest from the course: so a manual that is only ever about one
            venue arrived carrying whatever place the course had, and saying
            otherwise meant finding it in the library afterwards. */}
        {toLibrary && (
          options ? (
            <div className="mt-3 pt-3 border-t border-zinc-800 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <FilingFields
                value={filing ?? blankFiling(kind, name)}
                onChange={(next) => setFiling(next)}
                venues={options.venues}
                sites={options.sites}
                clients={options.clients}
                hideTitle
                hideLink
              />
            </div>
          ) : (
            <p className="mt-3 text-xs text-zinc-500">Reading the shelves…</p>
          )
        )}

        <div className="flex items-center gap-3 mt-5">
          <button
            onClick={submit}
            disabled={!canSubmit}
            className="px-4 py-2 bg-pr-red hover:bg-pr-red-dark text-white rounded text-sm font-medium transition-colors disabled:opacity-50"
          >
            {busy ? 'Adding…' : 'Add link'}
          </button>
          <button
            onClick={onCancel}
            disabled={busy}
            className="px-3 py-2 text-zinc-400 hover:text-zinc-200 text-sm disabled:opacity-50"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
