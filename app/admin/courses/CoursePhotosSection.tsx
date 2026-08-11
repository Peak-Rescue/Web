'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import AddLinkDialog from '@/components/AddLinkDialog'
import { AUDIENCE_META, type LibraryAudience } from '@/lib/library'
import { linkLabel, type CourseLink } from '@/lib/course-links'
import { addCourseLink, removeCourseLink, setCourseLinkAudience } from './link-actions'

const ALBUM_ICON =
  'M3 5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM3 16l5-5 4 4 3-3 6 6M9 9a1 1 0 1 1-2 0 1 1 0 0 1 2 0'

// The shared album for this delivery — Google Photos, Dropbox, wherever the
// team drops what they shot. It lives here rather than in Files because an
// album is a place people keep adding to, not a document, and because it's the
// one link students come back for after the course is over.
export default function CoursePhotosSection({
  instanceId,
  links,
}: {
  instanceId: string
  links: CourseLink[]
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)

  async function run(fn: () => Promise<void>) {
    setBusy(true)
    setError(null)
    try {
      await fn()
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong — please try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="p-6 pt-5 border-t border-zinc-800">
      <h3 className="text-sm font-semibold text-zinc-300 mb-1">Photo albums</h3>
      <p className="text-xs text-zinc-500 mb-3">Instructors-only until you share it.</p>

      {error && <p className="text-xs text-pr-red mb-2">{error}</p>}

      {links.length > 0 && (
        <div className="bg-zinc-950/40 border border-zinc-800 rounded-lg divide-y divide-zinc-800 mb-3">
          {links.map((l) => (
            <div key={l.id} className="flex items-center gap-3 px-4 py-3">
              <svg
                xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24"
                fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
                className="shrink-0 text-zinc-500"
              >
                <path d={ALBUM_ICON} />
              </svg>

              <a
                href={l.url}
                target="_blank"
                rel="noreferrer"
                className="min-w-0 flex-1 text-sm text-zinc-200 hover:text-white truncate"
              >
                {linkLabel(l)}
              </a>

              <select
                value={l.audience}
                disabled={busy}
                onChange={(e) =>
                  run(() => setCourseLinkAudience(instanceId, l.id, e.target.value as LibraryAudience))
                }
                className="shrink-0 bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs text-zinc-300 focus:outline-none focus:border-zinc-500 disabled:opacity-50"
              >
                <option value="internal">{AUDIENCE_META.internal.choice}</option>
                <option value="shared">{AUDIENCE_META.shared.choice}</option>
              </select>

              <button
                onClick={() => run(() => removeCourseLink(instanceId, l.id))}
                disabled={busy}
                title="Remove from this course"
                aria-label="Remove from this course"
                className="shrink-0 text-zinc-600 hover:text-pr-red-light transition-colors text-sm leading-none disabled:opacity-40"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      <button
        onClick={() => setAdding(true)}
        disabled={busy}
        className="text-xs px-2.5 py-1.5 rounded border border-zinc-700 text-zinc-300 hover:text-white hover:border-zinc-500 transition-colors disabled:opacity-40"
      >
        + Add an album
      </button>

      <AddLinkDialog
        open={adding}
        busy={busy}
        withAudience
        onCancel={() => setAdding(false)}
        onSubmit={(label, url, audience) =>
          run(async () => {
            await addCourseLink(instanceId, { url, label, purpose: 'photos', audience })
            setAdding(false)
          })
        }
      />
    </div>
  )
}
