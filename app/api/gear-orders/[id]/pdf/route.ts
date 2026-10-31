import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { generateGearOrderPdf } from '@/lib/gear-order-pdf'
import { courseDisplayName } from '@/lib/courses'
import { courseSubtitle } from '@/lib/course-access'
import { CLIENT_COLUMNS, clientLabel, type ClientRow } from '@/lib/clients'
import { type GearOrderLine } from '@/lib/gear-orders'

// Admin only — a gear order is commercial, and nothing about it belongs on the
// instructor-facing course page.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Not found', { status: 404 })

  const admin = createAdminClient()
  const { data: profile } = await admin.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return new Response('Not found', { status: 404 })

  const { data: order } = await admin
    .from('gear_orders')
    .select('id, instance_id, title, client_id, es_quote_number, responded_name, responded_at, client_note, gear_order_lines(id, entry_id, name, product, detail, category, qty_offered, qty_wanted, url, unit_price, size_options, sizes, removed, client_note, admin_note, sort_order)')
    .eq('id', id)
    .maybeSingle()
  if (!order) return new Response('Not found', { status: 404 })

  // An order with no course names itself and says who it is for.
  let courseTitle = order.title ?? 'Gear order'
  let subtitle: string | null = null
  if (order.instance_id) {
    const { data: inst } = await admin
      .from('course_instances')
      .select('ref_number, course_type, custom_title, client_name, starts_at, ends_at, location, status')
      .eq('id', order.instance_id)
      .single()
    if (!inst) return new Response('Not found', { status: 404 })
    courseTitle = courseDisplayName(inst.course_type, inst.custom_title)
    subtitle = courseSubtitle(inst)
  } else if (order.client_id) {
    const { data: clients } = await admin.from('clients').select(CLIENT_COLUMNS)
    subtitle = clientLabel((clients ?? []) as ClientRow[], order.client_id) || null
  }

  const lines = ([...(order.gear_order_lines ?? [])] as GearOrderLine[]).sort((a, b) => a.sort_order - b.sort_order)

  const bytes = await generateGearOrderPdf({
    courseTitle,
    courseSubtitle: subtitle,
    esQuoteNumber: order.es_quote_number,
    respondedName: order.responded_name,
    respondedAt: order.responded_at,
    clientNote: order.client_note,
    lines,
  })

  const filename = `${order.es_quote_number ?? courseTitle} - gear order.pdf`.replace(/[^\w .-]/g, '')
  return new Response(Buffer.from(bytes), {
    headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="${filename}"` },
  })
}
