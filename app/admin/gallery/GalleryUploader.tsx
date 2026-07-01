'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { categoryMeta, type ServiceCategory } from '@/lib/data/services'
import { createGalleryUploadTargets, finalizeGalleryUpload } from './actions'

const CATEGORY_KEYS = Object.keys(categoryMeta) as ServiceCategory[]
const MAX_BYTES = 25 * 1024 * 1024 // 25 MB per image

async function sha256(file: File): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer())
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('')
}

export function GalleryUploader() {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [cats, setCats] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [error, setError] = useState('')
  const [result, setResult] = useState('')

  function toggleCat(key: string) {
    setCats(c => (c.includes(key) ? c.filter(x => x !== key) : [...c, key]))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setResult('')
    const files = Array.from(inputRef.current?.files ?? [])
    if (files.length === 0) return

    for (const f of files) {
      if (!f.type.startsWith('image/')) return setError(`"${f.name}" is not an image.`)
      if (f.size > MAX_BYTES) return setError(`"${f.name}" is larger than 25 MB.`)
    }

    setBusy(true)
    setProgress({ done: 0, total: files.length })
    try {
      const supabase = createClient()
      const hashed = await Promise.all(files.map(async f => ({ file: f, hash: await sha256(f) })))
      const targets = await createGalleryUploadTargets(hashed.map(h => ({ name: h.file.name, hash: h.hash })))

      const uploaded: { path: string; hash: string }[] = []
      let skipped = 0
      for (let i = 0; i < hashed.length; i++) {
        const t = targets[i]
        if (!t) {
          skipped++
        } else {
          const { error: upErr } = await supabase.storage
            .from('gallery')
            .uploadToSignedUrl(t.path, t.token, hashed[i].file, { contentType: hashed[i].file.type })
          if (upErr) throw new Error(`Upload failed for "${hashed[i].file.name}": ${upErr.message}`)
          uploaded.push({ path: t.path, hash: hashed[i].hash })
        }
        setProgress({ done: i + 1, total: files.length })
      }

      if (uploaded.length) await finalizeGalleryUpload(uploaded, cats)

      if (inputRef.current) inputRef.current.value = ''
      setCats([])
      setProgress(null)
      setResult(
        `${uploaded.length} photo${uploaded.length === 1 ? '' : 's'} added` +
        (skipped ? `, ${skipped} skipped as duplicate${skipped === 1 ? '' : 's'}` : '')
      )
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="p-6 bg-zinc-900 rounded-lg border border-zinc-800 mb-10 space-y-4">
      <div className="space-y-2">
        <label className="block text-sm font-medium">Add photos</label>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          disabled={busy}
          onChange={() => { setResult(''); setError('') }}
          className="block text-sm text-zinc-400 file:mr-3 file:py-1.5 file:px-3 file:rounded file:border-0 file:text-xs file:font-medium file:bg-zinc-700 file:text-white hover:file:bg-zinc-600 file:cursor-pointer transition-colors disabled:opacity-50"
        />
        <p className="text-xs text-zinc-600">JPG or PNG, up to 25 MB each. Exact duplicates are skipped automatically.</p>
      </div>

      <div className="space-y-1.5">
        <span className="block text-xs text-zinc-400">Categories (applied to all uploaded photos)</span>
        <div className="flex flex-wrap gap-x-4 gap-y-1.5">
          {CATEGORY_KEYS.map(key => (
            <label key={key} className="flex items-center gap-1.5 text-xs text-zinc-300 cursor-pointer">
              <input
                type="checkbox"
                checked={cats.includes(key)}
                onChange={() => toggleCat(key)}
                disabled={busy}
                className="accent-pr-red cursor-pointer"
              />
              {categoryMeta[key].label}
            </label>
          ))}
        </div>
      </div>

      {error && <p className="text-sm text-pr-red" role="alert">{error}</p>}
      {result && <p className="text-sm text-teal-400">{result}</p>}

      <button
        type="submit"
        disabled={busy}
        className="px-4 py-2 bg-pr-red hover:bg-pr-red-dark disabled:opacity-50 disabled:cursor-not-allowed text-white rounded text-sm font-medium transition-colors cursor-pointer"
      >
        {busy && progress ? `Uploading ${progress.done}/${progress.total}…` : 'Upload photos'}
      </button>
    </form>
  )
}
