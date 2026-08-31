'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Lightbox from '@/components/Lightbox'
import TrashIcon from '@/components/TrashIcon'
import AudienceToggle from '@/components/AudienceToggle'
import { errorFrom } from '@/lib/action-result'
import AddLinkDialog from '@/components/AddLinkDialog'
import { addCourseLink, setCourseLinkAudience, removeCourseLink } from '@/app/admin/courses/link-actions'
import { linkLabel, type CourseLink } from '@/lib/course-links'
import { startPhotoUploads, recordPhotoUpload, removeCoursePhoto } from './photo-actions'

export type AlbumPhotoView = {
  id: string
  name: string
  uploadedBy: string | null
  isVideo: boolean
}

// The course album: what was shot, and a way to add to it.
//
// Everyone on the course can add. Only staff can remove, and that is enforced
// in the action rather than by hiding the button — but the button is hidden
// too, because an affordance that refuses is a worse answer than no affordance.
export default function CourseAlbum({
  instanceId,
  photos,
  canManage,
  album,
  linked,
}: {
  instanceId: string
  photos: AlbumPhotoView[]
  /** Staff: may remove photos, may share the album, may open it in Drive. */
  canManage: boolean
  /** Null until the first upload creates the folder. */
  album: { linkId: string; url: string; audience: 'internal' | 'shared' } | null
  /** Albums pasted onto this course before the portal made its own — usually
      in somebody's personal Google Photos. They live here rather than under
      Links so that "where are the photos" has one answer on every course,
      however old. */
  linked: CourseLink[]
}) {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [open, setOpen] = useState<number | null>(null)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [error, setError] = useState('')
  const [linking, setLinking] = useState(false)

  const src = (id: string, size: number) => `/api/course-photos/${instanceId}/${id}?s=${size}`
  // No size means the file itself, range-served. Only video asks for that.
  const fileSrc = (id: string) => `/api/course-photos/${instanceId}/${id}`

  async function addFiles(files: File[]) {
    if (files.length === 0) return
    setError('')
    setProgress({ done: 0, total: files.length })

    try {
      const result = await startPhotoUploads(
        instanceId,
        files.map((f) => ({ name: f.name, mimeType: f.type || 'application/octet-stream' }))
      )
      if ('error' in result) {
        setError(result.error)
        return
      }

      // One at a time on purpose. These are phone photos over whatever signal
      // a trailhead has, and ten parallel uploads on a weak connection finish
      // slower than ten sequential ones — and report progress that lies.
      for (let i = 0; i < files.length; i++) {
        const res = await fetch(result.sessions[i].uploadUrl, {
          method: 'PUT',
          headers: { 'Content-Type': files[i].type || 'application/octet-stream' },
          body: files[i],
        })
        if (!res.ok) throw new Error(`Upload failed for “${files[i].name}”`)

        const { id } = (await res.json()) as { id: string }
        // Attribution only. A failure here loses the name against the photo,
        // never the photo — so it must not fail the upload the person just
        // watched succeed.
        await recordPhotoUpload(instanceId, id).catch(() => {})

        setProgress({ done: i + 1, total: files.length })
      }

      router.refresh()
    } catch (e) {
      setError(errorFrom(e))
    } finally {
      setProgress(null)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  async function removeLinked(link: CourseLink) {
    if (!confirm(`Remove the link to “${linkLabel(link)}”? The album itself is untouched.`)) return
    setError('')
    try {
      const result = await removeCourseLink(instanceId, link.id)
      if (result?.error) setError(result.error)
      else router.refresh()
    } catch (e) {
      setError(errorFrom(e))
    }
  }

  async function remove(photoId: string, name: string) {
    if (!confirm(`Remove “${name}”? It goes to the Drive trash and can be restored for 30 days.`)) return
    setError('')
    try {
      const result = await removeCoursePhoto(instanceId, photoId)
      if (result?.error) setError(result.error)
      else router.refresh()
    } catch (e) {
      setError(errorFrom(e))
    }
  }

  // Who can see the album sits on the album, not on a list of links two
  // sections away. It is the same control and the same action as every other
  // link on a course — only somewhere you'd think to look for it.
  async function share(next: 'internal' | 'shared') {
    if (!album) return
    setError('')
    try {
      await setCourseLinkAudience(instanceId, album.linkId, next)
      router.refresh()
    } catch (e) {
      setError(errorFrom(e))
    }
  }

  return (
    <div>
      {canManage && album && (
        <div className="flex items-center gap-3 mb-3">
          <AudienceToggle
            audience={album.audience}
            noun="this album"
            onChange={(next) => share(next as 'internal' | 'shared')}
          />
          <a
            href={album.url}
            target="_blank"
            rel="noreferrer"
            className="text-xs text-zinc-500 hover:text-white transition-colors"
          >
            Open in Drive
          </a>
        </div>
      )}

      {error && <p className="text-xs text-pr-red mb-3">{error}</p>}

      {linked.length > 0 && (
        <div className="mb-4">
          <p className="text-[11px] uppercase tracking-wide text-zinc-500 mb-1.5">Linked elsewhere</p>
          <div className="bg-zinc-950/40 border border-zinc-800 rounded-lg divide-y divide-zinc-800">
            {linked.map((l) => (
              <div key={l.id} className="flex items-center gap-3 px-4 py-2.5">
                <svg
                  xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24"
                  fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
                  className="shrink-0 text-zinc-500" aria-hidden
                >
                  <path d="M3 5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM3 16l5-5 4 4 3-3 6 6M9 9a1 1 0 1 1-2 0 1 1 0 0 1 2 0" />
                </svg>
                <a
                  href={l.url}
                  target="_blank"
                  rel="noreferrer"
                  className="min-w-0 flex-1 text-sm text-zinc-200 hover:text-white truncate"
                >
                  {linkLabel(l)}
                </a>
                {canManage && (
                  <>
                    <AudienceToggle
                      audience={l.audience}
                      noun="this album"
                      showInstructors={false}
                      onChange={(next) =>
                        setCourseLinkAudience(instanceId, l.id, next).then(() => router.refresh())
                      }
                    />
                    <button
                      type="button"
                      onClick={() => removeLinked(l)}
                      title="Remove this link from the course"
                      aria-label={`Remove the link to ${linkLabel(l)}`}
                      className="shrink-0 text-zinc-600 hover:text-pr-red-light transition-colors disabled:opacity-40"
                    >
                      <TrashIcon />
                    </button>
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {photos.length === 0 ? (
        <p className="text-sm text-zinc-500 mb-4">No photos or videos yet.</p>
      ) : (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2 mb-4">
          {photos.map((p, i) => (
            <div key={p.id} className="group relative aspect-square overflow-hidden rounded bg-zinc-900">
              <button
                type="button"
                onClick={() => setOpen(i)}
                aria-label={p.isVideo ? `Play ${p.name}` : `Enlarge ${p.name}`}
                className="absolute inset-0 cursor-zoom-in"
              >
                {/* Deliberately not next/image: these are private, per-viewer
                    responses from our own route, so there is nothing for the
                    optimizer to cache and no width known ahead of time. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={src(p.id, 400)}
                  alt={p.name}
                  loading="lazy"
                  className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                />
                {/* A video's tile is a still like any other, so it needs to say
                    that pressing it plays something. */}
                {p.isVideo && (
                  <span className="absolute inset-0 flex items-center justify-center">
                    <span className="rounded-full bg-black/55 p-2.5">
                      <svg
                        aria-hidden
                        xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24"
                        fill="currentColor" className="text-white/90"
                      >
                        <path d="M8 5v14l11-7z" />
                      </svg>
                    </span>
                  </span>
                )}
              </button>

              {/* Always visible, only understated. This appeared on hover, which
                  meant it did not exist on a phone or an iPad — and those are
                  what the photos are being looked at on. An action nobody can
                  reach is the same as an action nobody built. */}
              {canManage && (
                <button
                  type="button"
                  onClick={() => remove(p.id, p.name)}
                  aria-label={`Remove ${p.name}`}
                  title={p.isVideo ? 'Remove this video' : 'Remove this photo'}
                  className="absolute top-1 right-1 rounded bg-black/60 p-1 text-zinc-300 opacity-75 hover:opacity-100 focus-visible:opacity-100 hover:text-pr-red-light transition"
                >
                  <TrashIcon />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        multiple
        accept="image/*,video/*"
        className="hidden"
        onChange={(e) => addFiles(Array.from(e.target.files ?? []))}
      />

      <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={progress !== null}
        className="text-xs px-2.5 py-1.5 rounded border border-zinc-700 text-zinc-300 hover:text-white hover:border-zinc-500 transition-colors disabled:opacity-40"
      >
        {/* Spelled out rather than "+ Add": the button is where anyone learns
            that video is welcome here, and the picker accepts it either way. */}
        {progress ? `Uploading ${progress.done}/${progress.total}…` : '+ Add photos or videos'}
      </button>

      {/* An album someone keeps elsewhere is still this course's album. The
          portal's own folder is the default, not the only allowed answer. */}
      {canManage && (
        <button
          type="button"
          onClick={() => setLinking(true)}
          disabled={progress !== null}
          className="text-xs px-2.5 py-1.5 rounded border border-zinc-800 text-zinc-400 hover:text-white hover:border-zinc-600 transition-colors disabled:opacity-40"
        >
          + Link an album elsewhere
        </button>
      )}
      </div>

      <AddLinkDialog
        open={linking}
        busy={progress !== null}
        withAudience
        onCancel={() => setLinking(false)}
        onSubmit={(label, url, audience) => {
          setError('')
          addCourseLink(instanceId, { url, label, purpose: 'photos', audience })
            .then((result) => {
              if (result?.error) setError(result.error)
              else router.refresh()
              setLinking(false)
            })
            .catch((e) => { setError(errorFrom(e)); setLinking(false) })
        }}
      />

      <Lightbox
        items={photos.map((p) => ({
          url: p.isVideo ? fileSrc(p.id) : src(p.id, 1600),
          poster: p.isVideo ? src(p.id, 1600) : undefined,
          kind: p.isVideo ? ('video' as const) : ('image' as const),
          caption: p.uploadedBy ? `Added by ${p.uploadedBy}` : null,
        }))}
        index={open}
        onIndexChange={setOpen}
        onClose={() => setOpen(null)}
        unoptimized
      />
    </div>
  )
}
