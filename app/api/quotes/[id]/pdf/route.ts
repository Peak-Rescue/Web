import { createAdminClient } from '@/lib/supabase/admin'
import { viewerIsAdmin } from '@/lib/course-access'
import { quotePdfResponse } from '@/lib/quote-pdf-request'

// Admin only, like the quotes list it is linked from.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!(await viewerIsAdmin(createAdminClient()))) return new Response('Not found', { status: 404 })
  return quotePdfResponse(id)
}
