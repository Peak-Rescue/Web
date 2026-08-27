'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { type SiteLink } from '@/lib/sites'

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')
  const admin = createAdminClient()
  const { data: profile } = await admin.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') throw new Error('Not authorised')
  return admin
}

// A site's beta is read on the course page and printed on the schedule PDF, so
// correcting one has to reach every course showing it — not just this screen.
function revalidate() {
  revalidatePath('/admin/sites')
  revalidatePath('/admin/venues')
  revalidatePath('/admin/schedules', 'layout')
  revalidatePath('/portal', 'layout')
}

function cleanLinks(raw: unknown): SiteLink[] {
  if (!Array.isArray(raw)) return []
  return raw
    .map((l) => ({
      url: String((l as SiteLink)?.url ?? '').trim(),
      label: String((l as SiteLink)?.label ?? '').trim(),
    }))
    .filter((l) => /^https?:\/\//i.test(l.url))
    .map((l) => ({ url: l.url.slice(0, 500), label: (l.label || hostOf(l.url)).slice(0, 80) }))
    .slice(0, 10)
}

function hostOf(url: string) {
  try { return new URL(url).hostname.replace(/^www\./, '') } catch { return 'link' }
}

export async function createSite(formData: FormData) {
  const admin = await requireAdmin()
  const name = ((formData.get('name') as string) || '').trim()
  if (!name) throw new Error('Name is required')
  const { error } = await admin.from('sites').insert({
    name: name.slice(0, 160),
    venue_id: ((formData.get('venue_id') as string) || '') || null,
    kind: ((formData.get('kind') as string) || '').trim() || null,
    beta: ((formData.get('beta') as string) || '').trim() || null,
    coords: ((formData.get('coords') as string) || '').trim() || null,
  })
  if (error) throw new Error(error.message)
  revalidate()
}

export async function updateSite(
  id: string,
  patch: {
    name?: string
    venue_id?: string | null
    kind?: string | null
    beta?: string | null
    coords?: string | null
    links?: SiteLink[]
    active?: boolean
  }
) {
  const admin = await requireAdmin()
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (patch.name !== undefined) update.name = patch.name.trim().slice(0, 160) || 'Untitled site'
  if (patch.venue_id !== undefined) update.venue_id = patch.venue_id || null
  if (patch.kind !== undefined) update.kind = patch.kind?.trim() || null
  if (patch.beta !== undefined) update.beta = patch.beta?.trim() || null
  if (patch.coords !== undefined) update.coords = patch.coords?.trim() || null
  if (patch.links !== undefined) update.links = cleanLinks(patch.links)
  if (patch.active !== undefined) update.active = patch.active
  const { error } = await admin.from('sites').update(update).eq('id', id)
  if (error) throw new Error(error.message)
  revalidate()
}

export async function deleteSite(id: string) {
  const admin = await requireAdmin()
  // Days keep their own notes and location; the FK's ON DELETE SET NULL just
  // drops the link, so deleting a site never blanks a schedule.
  const { error } = await admin.from('sites').delete().eq('id', id)
  if (error) throw new Error(error.message)
  revalidate()
}
