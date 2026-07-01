'use server'

import { randomUUID } from 'crypto'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

const BUCKET = 'gallery'
const MAX_BYTES = 15 * 1024 * 1024 // 15 MB per image

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')
  const admin = createAdminClient()
  const { data: profile } = await admin.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') throw new Error('Not authorized')
  return admin
}

function revalidate() {
  revalidatePath('/admin/gallery')
  revalidatePath('/gallery')
}

export async function uploadGalleryImages(formData: FormData) {
  const admin = await requireAdmin()
  const files = formData
    .getAll('photos')
    .filter((f): f is File => f instanceof File && f.size > 0)

  for (const file of files) {
    if (!file.type.startsWith('image/')) throw new Error(`"${file.name}" is not an image.`)
    if (file.size > MAX_BYTES) throw new Error(`"${file.name}" is larger than 15 MB.`)

    const ext = file.name.split('.').pop()?.toLowerCase() ?? 'jpg'
    const key = `${randomUUID()}.${ext}`
    const bytes = await file.arrayBuffer()

    const { error: uploadError } = await admin.storage
      .from(BUCKET)
      .upload(key, bytes, { contentType: file.type, upsert: false })
    if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`)

    const { data: { publicUrl } } = admin.storage.from(BUCKET).getPublicUrl(key)
    const { error: insertError } = await admin.from('gallery_images').insert({ url: publicUrl })
    if (insertError) throw new Error(insertError.message)
  }

  revalidate()
}

export async function updateGalleryCaption(id: string, formData: FormData) {
  const admin = await requireAdmin()
  const caption = ((formData.get('caption') as string) || '').trim() || null
  const { error } = await admin.from('gallery_images').update({ caption }).eq('id', id)
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
