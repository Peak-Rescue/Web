'use client'

import { useState } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { categoryMeta, type ServiceCategory } from '@/lib/data/services'
import { updateGalleryImages, deleteGalleryImage } from './actions'

const CATEGORY_KEYS = Object.keys(categoryMeta) as ServiceCategory[]

type GalleryImage = {
  id: string
  url: string
  caption: string | null
  categories: string[] | null
}

type Edit = { caption: string; categories: string[] }

function baseline(img: GalleryImage): Edit {
  return { caption: img.caption ?? '', categories: img.categories ?? [] }
}

function sameCategories(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false
  const set = new Set(a)
  return b.every(x => set.has(x))
}

export function GalleryEditor({ images }: { images: GalleryImage[] }) {
  const router = useRouter()
  // Edits overlay keyed by image id; absent = unchanged from what's on screen.
  const [edits, setEdits] = useState<Record<string, Edit>>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const current = (img: GalleryImage): Edit => edits[img.id] ?? baseline(img)

  function isDirty(img: GalleryImage): boolean {
    const e = edits[img.id]
    if (!e) return false
    const b = baseline(img)
    return e.caption !== b.caption || !sameCategories(e.categories, b.categories)
  }

  const dirty = images.filter(isDirty)

  function setEdit(img: GalleryImage, patch: Partial<Edit>) {
    setEdits(prev => ({ ...prev, [img.id]: { ...current(img), ...patch } }))
  }

  function toggleCat(img: GalleryImage, key: string) {
    const cats = current(img).categories
    setEdit(img, { categories: cats.includes(key) ? cats.filter(c => c !== key) : [...cats, key] })
  }

  async function saveAll() {
    if (dirty.length === 0) return
    setBusy(true)
    setError('')
    try {
      await updateGalleryImages(
        dirty.map(img => ({ id: img.id, ...current(img) }))
      )
      setEdits({})
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed.')
    } finally {
      setBusy(false)
    }
  }

  async function remove(img: GalleryImage) {
    if (!confirm('Delete this photo? This cannot be undone.')) return
    setBusy(true)
    setError('')
    try {
      await deleteGalleryImage(img.id)
      setEdits(prev => {
        const next = { ...prev }
        delete next[img.id]
        return next
      })
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      {error && <p className="text-sm text-pr-red" role="alert">{error}</p>}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {images.map(img => {
          const e = current(img)
          const changed = isDirty(img)
          return (
            <div
              key={img.id}
              className={`rounded-lg overflow-hidden bg-zinc-900 border ${changed ? 'border-pr-red' : 'border-zinc-800'}`}
            >
              <div className="relative aspect-[4/3] bg-zinc-800">
                <Image src={img.url} alt={e.caption} fill className="object-cover" sizes="(max-width: 640px) 100vw, 50vw" />
              </div>
              <div className="p-3 space-y-3">
                <input
                  type="text"
                  value={e.caption}
                  onChange={ev => setEdit(img, { caption: ev.target.value })}
                  disabled={busy}
                  placeholder="Add a caption (optional)"
                  className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-sm focus:outline-none focus:border-zinc-500 disabled:opacity-50"
                />
                <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                  {CATEGORY_KEYS.map(key => (
                    <label key={key} className="flex items-center gap-1.5 text-xs text-zinc-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={e.categories.includes(key)}
                        onChange={() => toggleCat(img, key)}
                        disabled={busy}
                        className="accent-pr-red cursor-pointer"
                      />
                      {categoryMeta[key].label}
                    </label>
                  ))}
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-pr-red">{changed ? 'Unsaved changes' : ''}</span>
                  <button
                    type="button"
                    onClick={() => remove(img)}
                    disabled={busy}
                    className="text-xs text-zinc-500 hover:text-red-400 transition-colors cursor-pointer disabled:opacity-50"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Sticky save bar — only visible when there are pending edits */}
      {dirty.length > 0 && (
        <div className="sticky bottom-4 z-10 flex items-center justify-between gap-4 p-3 rounded-lg bg-zinc-900 border border-pr-red shadow-lg">
          <span className="text-sm text-zinc-300">
            {dirty.length} photo{dirty.length === 1 ? '' : 's'} with unsaved changes
          </span>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setEdits({})}
              disabled={busy}
              className="text-xs text-zinc-400 hover:text-zinc-200 transition-colors cursor-pointer disabled:opacity-50"
            >
              Discard
            </button>
            <button
              type="button"
              onClick={saveAll}
              disabled={busy}
              className="px-4 py-2 bg-pr-red hover:bg-pr-red-dark disabled:opacity-50 disabled:cursor-not-allowed text-white rounded text-sm font-medium transition-colors cursor-pointer"
            >
              {busy ? 'Saving…' : `Save all (${dirty.length})`}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
