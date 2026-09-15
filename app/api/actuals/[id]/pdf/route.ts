import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { actualsPdfResponse } from '@/lib/actuals-pdf-request'

// Admin only, like the whole of the pricing page. Instructors never see money.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Not found', { status: 404 })

  const admin = createAdminClient()
  const { data: profile } = await admin.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return new Response('Not found', { status: 404 })

  return actualsPdfResponse(id)
}
