import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { generateExpensePdf } from '@/lib/expense-pdf'
import { loadReport } from '@/lib/expense-report-data'

// Renders the report PDF on demand — the same output that was emailed on
// submit. Accessible to the report's owner and admins.
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const admin = createAdminClient()
  const loaded = await loadReport(id)
  if (!loaded) return new Response('Not found', { status: 404 })

  if (loaded.report.profile_id !== user.id) {
    const { data: profile } = await admin.from('profiles').select('role').eq('id', user.id).single()
    if (profile?.role !== 'admin') return new Response('Not found', { status: 404 })
  }

  const pdfBytes = await generateExpensePdf(loaded.pdfReport)
  const date = (loaded.report.submitted_at ?? new Date().toISOString()).slice(0, 10)
  const filename = `Expense Report - ${loaded.pdfReport.employeeName} - ${date}.pdf`

  return new Response(Buffer.from(pdfBytes), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${filename.replace(/[^\w .-]/g, '')}"`,
    },
  })
}
