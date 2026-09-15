import { createAdminClient } from '@/lib/supabase/admin'
import { actualsPdfResponse } from '@/lib/actuals-pdf-request'

// The same file the admin downloads, for whoever holds the link. The token is
// the whole of the authorisation, exactly as on the page it sits beside — a
// recipient who can read the numbers can obviously keep them.
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  if (!/^[0-9a-f-]{36}$/.test(token)) return new Response('Not found', { status: 404 })

  const admin = createAdminClient()
  const { data: row } = await admin
    .from('course_actuals')
    .select('instance_id')
    .eq('share_token', token)
    .maybeSingle()
  if (!row) return new Response('Not found', { status: 404 })

  return actualsPdfResponse(row.instance_id as string)
}
