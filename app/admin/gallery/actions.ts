'use server'

import { randomUUID } from 'crypto'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { categoryMeta } from '@/lib/data/services'

const BUCKET = 'gallery'
const VALID_CATEGORIES = new Set(Object.keys(categoryMeta))

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')
  const admin = createAdminClient()
  const { data: profile } = await admin.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') throw new Error('Not authorized')
  return admin
}

function cleanCategories(input: string[]): string[] {
  return [...new Set(input.filter(c => VALID_CATEGORIES.has(c)))]
}

function revalidate() {
  revalidatePath('/admin/gallery')
  revalidatePath('/gallery')
}

// Mint signed upload URLs so the browser can upload directly to Storage,
// bypassing the server-action / serverless request body size limits.
// Returns a target per input file, or null where the file's hash already
// exists (duplicate) — including duplicates within the same batch.
export async function createGalleryUploadTargets(
  files: { name: string; hash: string }[]
): Promise<({ path: string; token: string } | null)[]> {
  const admin = await requireAdmin()

  const hashes = files.map(f => f.hash).filter(Boolean)
  const { data: existing } = hashes.length
    ? await admin.from('gallery_images').select('hash').in('hash', hashes)
    : { data: [] as { hash: string | null }[] }
  const seen = new Set((existing ?? []).map(r => r.hash))

  const targets: ({ path: string; token: string } | null)[] = []
  for (const file of files) {
    if (file.hash && seen.has(file.hash)) {
      targets.push(null) // duplicate
      continue
    }
    if (file.hash) seen.add(file.hash)
    const ext = (file.name.split('.').pop() ?? 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg'
    const path = `${randomUUID()}.${ext}`
    const { data, error } = await admin.storage.from(BUCKET).createSignedUploadUrl(path)
    if (error || !data) throw new Error(error?.message ?? 'Could not create upload URL')
    targets.push({ path: data.path, token: data.token })
  }
  return targets
}

// Record rows for files the browser already uploaded to Storage.
export async function finalizeGalleryUpload(
  items: { path: string; hash: string }[],
  categoryList: string[]
) {
  const admin = await requireAdmin()
  const categories = cleanCategories(categoryList)
  const rows = items.map(({ path, hash }) => {
    const { data: { publicUrl } } = admin.storage.from(BUCKET).getPublicUrl(path)
    return { url: publicUrl, hash, categories }
  })
  if (rows.length === 0) return
  // ignoreDuplicates guards against a rare race between the check and insert.
  const { error } = await admin.from('gallery_images').upsert(rows, { onConflict: 'hash', ignoreDuplicates: true })
  if (error) throw new Error(error.message)
  revalidate()
}

// Save edits to several images in one request (used by the "Save all" button).
export async function updateGalleryImages(
  updates: { id: string; caption: string; categories: string[] }[]
) {
  const admin = await requireAdmin()
  for (const u of updates) {
    const caption = (u.caption || '').trim() || null
    const categories = cleanCategories(u.categories)
    const { error } = await admin
      .from('gallery_images')
      .update({ caption, categories })
      .eq('id', u.id)
    if (error) throw new Error(error.message)
  }
  revalidate()
}

// Persist a full ordering: ids in display order become sort_order 1..N.
// (New uploads default to sort_order 0, so they surface at the top until
// deliberately placed.)
export async function reorderGalleryImages(orderedIds: string[]) {
  const admin = await requireAdmin()
  for (let i = 0; i < orderedIds.length; i++) {
    const { error } = await admin
      .from('gallery_images')
      .update({ sort_order: i + 1 })
      .eq('id', orderedIds[i])
    if (error) throw new Error(error.message)
  }
  revalidate()
}

export async function deleteGalleryImage(id: string) {
  const admin = await requireAdmin()

  // Remove the storage object too (path is everything after /gallery/ in the URL).
  const { data: row } = await admin.from('gallery_images').select('url').eq('id', id).single()
  if (row?.url) {
    try {
      const marker = `/${BUCKET}/`
      const path = new URL(row.url).pathname
      const idx = path.indexOf(marker)
      if (idx !== -1) await admin.storage.from(BUCKET).remove([path.slice(idx + marker.length)])
    } catch {
      // Non-fatal — still remove the DB row below.
    }
  }

  const { error } = await admin.from('gallery_images').delete().eq('id', id)
  if (error) throw new Error(error.message)
  revalidate()
}
