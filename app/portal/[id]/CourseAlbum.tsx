'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Lightbox from '@/components/Lightbox'
import TrashIcon from '@/components/TrashIcon'
import AudienceToggle from '@/components/AudienceToggle'
import { errorFrom } from '@/lib/action-result'
import { setCourseLinkAudience } from '@/app/admin/courses/link-actions'
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
}: {
  instanceId: string
  photos: AlbumPhotoView[]
  /** Staff: may remove photos, may share the album, may open it in Drive. */
  canManage: boolean
  /** Null until the first upload creates the folder. */
  album: { linkId: string; url: string; audience: 'internal' | 'shared' } | null
}) {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [open, setOpen] = useState<number | null>(null)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [error, setError] = useState('')

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

      {photos.length === 0 ? (
        <p className="text-sm text-zinc-500 mb-4">No photos yet.</p>
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

              {canManage && (
                <button
                  type="button"
                  onClick={() => remove(p.id, p.name)}
                  aria-label={`Remove ${p.name}`}
                  title="Remove this photo"
                  className="absolute top-1 right-1 rounded bg-black/60 p-1 text-zinc-300 opacity-0 group-hover:opacity-100 hover:text-pr-red-light transition"
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

      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={progress !== null}
        className="text-xs px-2.5 py-1.5 rounded border border-zinc-700 text-zinc-300 hover:text-white hover:border-zinc-500 transition-colors disabled:opacity-40"
      >
        {progress ? `Uploading ${progress.done}/${progress.total}…` : '+ Add photos'}
      </button>

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
