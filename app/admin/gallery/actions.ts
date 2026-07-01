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

// Read checked category boxes from a form (used by the per-image edit).
function parseCategories(formData: FormData): string[] {
  return cleanCategories(formData.getAll('categories').map(String))
}

function revalidate() {
  revalidatePath('/admin/gallery')
  revalidatePath('/gallery')
}

// Mint signed upload URLs so the browser can upload directly to Storage,
// bypassing the server-action / serverless request body size limits.
export async function createGalleryUploadTargets(
  files: { name: string }[]
): Promise<{ path: string; token: string }[]> {
  const admin = await requireAdmin()
  const targets: { path: string; token: string }[] = []
  for (const file of files) {
    const ext = (file.name.split('.').pop() ?? 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg'
    const path = `${randomUUID()}.${ext}`
    const { data, error } = await admin.storage.from(BUCKET).createSignedUploadUrl(path)
    if (error || !data) throw new Error(error?.message ?? 'Could not create upload URL')
    targets.push({ path: data.path, token: data.token })
  }
  return targets
}

// Record rows for files the browser already uploaded to Storage.
export async function finalizeGalleryUpload(paths: string[], categoryList: string[]) {
  const admin = await requireAdmin()
  const categories = cleanCategories(categoryList)
  const rows = paths.map(path => {
    const { data: { publicUrl } } = admin.storage.from(BUCKET).getPublicUrl(path)
    return { url: publicUrl, categories }
  })
  if (rows.length === 0) return
  const { error } = await admin.from('gallery_images').insert(rows)
  if (error) throw new Error(error.message)
  revalidate()
}

export async function updateGalleryImage(id: string, formData: FormData) {
  const admin = await requireAdmin()
  const caption = ((formData.get('caption') as string) || '').trim() || null
  const categories = parseCategories(formData)
  const { error } = await admin
    .from('gallery_images')
    .update({ caption, categories })
    .eq('id', id)
  if (error) throw new Error(error.message)
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
