'use client'

import { useState } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { categoryMeta, type ServiceCategory } from '@/lib/data/services'
import { updateGalleryImages, deleteGalleryImage, reorderGalleryImages } from './actions'

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

  // Local display order (optimistic while a reorder saves), re-synced from
  // the server prop whenever it changes (render-time compare — no effects).
  const [orderIds, setOrderIds] = useState<string[]>(() => images.map(i => i.id))
  const propKey = images.map(i => i.id).join('|')
  const [syncedKey, setSyncedKey] = useState(propKey)
  if (syncedKey !== propKey) {
    setSyncedKey(propKey)
    setOrderIds(images.map(i => i.id))
  }
  const [dragId, setDragId] = useState<string | null>(null)

  const byId = new Map(images.map(i => [i.id, i]))
  const ordered = orderIds.map(id => byId.get(id)).filter((i): i is GalleryImage => Boolean(i))

  async function applyOrder(next: string[]) {
    setOrderIds(next)
    setBusy(true)
    setError('')
    try {
      await reorderGalleryImages(next)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Reorder failed.')
    } finally {
      setBusy(false)
    }
  }

  function moveBy(id: string, delta: number) {
    const from = orderIds.indexOf(id)
    const to = from + delta
    if (from < 0 || to < 0 || to >= orderIds.length) return
    const next = [...orderIds]
    ;[next[from], next[to]] = [next[to], next[from]]
    void applyOrder(next)
  }

  function dropOn(targetId: string) {
    if (!dragId || dragId === targetId) return
    const next = orderIds.filter(x => x !== dragId)
    next.splice(next.indexOf(targetId), 0, dragId)
    setDragId(null)
    void applyOrder(next)
  }

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

      <p className="text-xs text-zinc-500">
        Drag to reorder — this is the order the public gallery shows.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {ordered.map((img, idx) => {
          const e = current(img)
          const changed = isDirty(img)
          return (
            <div
              key={img.id}
              onDragOver={ev => { if (dragId && dragId !== img.id) ev.preventDefault() }}
              onDrop={ev => { ev.preventDefault(); dropOn(img.id) }}
              className={`rounded-lg overflow-hidden bg-zinc-900 border ${
                changed ? 'border-pr-red' : dragId && dragId !== img.id ? 'border-zinc-600 border-dashed' : 'border-zinc-800'
              } ${dragId === img.id ? 'opacity-40' : ''}`}
            >
              <div
                className="relative aspect-[4/3] bg-zinc-800 cursor-grab active:cursor-grabbing"
                draggable={!busy}
                onDragStart={() => setDragId(img.id)}
                onDragEnd={() => setDragId(null)}
              >
                <Image src={img.url} alt={e.caption} fill className="object-cover" sizes="(max-width: 640px) 100vw, 50vw" />
                <span className="absolute top-2 left-2 px-1.5 py-0.5 rounded bg-black/60 text-[10px] text-zinc-300">
                  #{idx + 1}
                </span>
                <div className="absolute top-2 right-2 flex gap-1">
                  <button
                    type="button"
                    onClick={() => moveBy(img.id, -1)}
                    disabled={busy || idx === 0}
                    aria-label="Move earlier"
                    className="w-6 h-6 rounded bg-black/60 text-zinc-300 hover:text-white text-sm leading-none disabled:opacity-30 transition-colors"
                  >
                    ‹
                  </button>
                  <button
                    type="button"
                    onClick={() => moveBy(img.id, 1)}
                    disabled={busy || idx === ordered.length - 1}
                    aria-label="Move later"
                    className="w-6 h-6 rounded bg-black/60 text-zinc-300 hover:text-white text-sm leading-none disabled:opacity-30 transition-colors"
                  >
                    ›
                  </button>
                </div>
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
