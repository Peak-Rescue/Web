'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import AddLinkDialog from '@/components/AddLinkDialog'
import { AUDIENCE_META, type LibraryAudience } from '@/lib/library'
import { PURPOSE_META, PURPOSE_ORDER, LIBRARY_HREF, linkLabel, type CourseLink, type LinkPurpose } from '@/lib/course-links'
import { addCourseLink, removeCourseLink, setCourseLinkAudience } from './link-actions'

const ICON: Record<LinkPurpose, string> = {
  photos: 'M3 5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM3 16l5-5 4 4 3-3 6 6M9 9a1 1 0 1 1-2 0 1 1 0 0 1 2 0',
  form: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M16 13H8M16 17H8M10 9H8',
  resource: 'M4 19.5A2.5 2.5 0 0 1 6.5 17H20M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z',
  other: 'M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71',
}

// Links that belong to this delivery and no other: the shared photo album, the
// client's paperwork, a permit portal. Anything we expect to reuse goes in the
// library instead, where it can be found again — the split is deliberate, and
// the hint under each heading says so.
export default function CourseLinksSection({
  instanceId,
  links,
}: {
  instanceId: string
  links: CourseLink[]
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [adding, setAdding] = useState<LinkPurpose | null>(null)

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

  const btn =
    'text-xs px-2.5 py-1.5 rounded border border-zinc-700 text-zinc-300 hover:text-white hover:border-zinc-500 transition-colors disabled:opacity-40'

  // An empty purpose still shows its add button — the point is to make the
  // place obvious before anyone has used it. "Other" is the exception: it's a
  // fallback, not a prompt, so it only appears once something is in it.
  const shown = PURPOSE_ORDER.filter(
    (p) => p !== 'other' || links.some((l) => l.purpose === 'other')
  )

  return (
    <div className="p-6 pt-5 border-t border-zinc-800">
      <h3 className="text-sm font-semibold text-zinc-300 mb-1">Links</h3>
      <p className="text-xs text-zinc-500 mb-3">
        For this course only. Anything worth using again belongs in the{' '}
        <Link href={LIBRARY_HREF} className="text-zinc-300 underline decoration-zinc-600 hover:text-white hover:decoration-zinc-400 transition-colors">
          content library
        </Link>
        , where it can be found by discipline and topic.
      </p>

      {error && <p className="text-xs text-pr-red mb-2">{error}</p>}

      <div className="space-y-5">
        {shown.map((purpose) => {
          const meta = PURPOSE_META[purpose]
          const rows = links.filter((l) => l.purpose === purpose)
          return (
            <div key={purpose}>
              <div className="flex items-baseline gap-2 mb-1.5 flex-wrap">
                <h4 className="text-xs font-medium text-zinc-300">{meta.label}</h4>
                {meta.hint && <span className="text-[11px] text-zinc-600">{meta.hint}</span>}
              </div>

              {rows.length > 0 && (
                <div className="bg-zinc-950/40 border border-zinc-800 rounded-lg divide-y divide-zinc-800 mb-2">
                  {rows.map((l) => (
                    <div key={l.id} className="flex items-center gap-3 px-4 py-3">
                      <svg
                        xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24"
                        fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
                        className="shrink-0 text-zinc-500"
                      >
                        <path d={ICON[l.purpose]} />
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
                        className="shrink-0 text-zinc-600 hover:text-pr-red transition-colors text-xs disabled:opacity-40"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex items-center gap-3 flex-wrap">
                <button onClick={() => setAdding(purpose)} disabled={busy} className={btn}>
                  + {meta.verb}
                </button>
                {/* One click to the shelf this section keeps pointing at —
                    being told where reusable material lives is no use if
                    getting there means finding the library yourself. */}
                {meta.library && (
                  <Link
                    href={meta.library.href}
                    className="inline-flex items-center gap-1 text-[11px] text-zinc-500 hover:text-zinc-200 transition-colors"
                  >
                    {meta.library.text} in the library
                    <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M5 12h14M13 6l6 6-6 6" />
                    </svg>
                  </Link>
                )}
              </div>
            </div>
          )
        })}
      </div>

      <AddLinkDialog
        open={adding !== null}
        busy={busy}
        onCancel={() => setAdding(null)}
        onSubmit={(label, url) => {
          const purpose = adding
          if (!purpose) return
          run(async () => {
            await addCourseLink(instanceId, { url, label, purpose })
            setAdding(null)
          })
        }}
      />
    </div>
  )
}
