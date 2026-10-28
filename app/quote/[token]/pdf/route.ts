import { createAdminClient } from '@/lib/supabase/admin'
import { quotePdfResponse } from '@/lib/quote-pdf-request'

// The same file the admin downloads, for whoever holds the quote link. The
// token is the whole of the authorisation, exactly as on the page beside it.
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  if (!/^[0-9a-f-]{36}$/.test(token)) return new Response('Not found', { status: 404 })

  const admin = createAdminClient()
  const { data: row } = await admin.from('course_quotes').select('id').eq('accept_token', token).maybeSingle()
  if (!row) return new Response('Not found', { status: 404 })

  return quotePdfResponse(row.id as string)
}
