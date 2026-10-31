import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { CLIENT_COLUMNS, clientLabel, type ClientRow } from '@/lib/clients'
import { courseShortName } from '@/lib/courses'
import { fmtMoney } from '@/lib/expenses'
import { GEAR_ORDER_STATUS_LABEL, GEAR_ORDER_STATUS_STYLE, orderTotal, type GearOrderStatus } from '@/lib/gear-orders'
import NewOrderForm from './NewOrderForm'

export const metadata = { title: 'Gear orders' }

// Every gear order in one place. A course's order is listed here and worked on
// from its course, which is where its contact, dates and paperwork live.
export default async function GearOrdersPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = createAdminClient()
  const { data: profile } = await admin.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') redirect('/dashboard')

  const [{ data: orderRows }, { data: clientRows }, { data: listRows }] = await Promise.all([
    admin.from('gear_orders')
      .select('id, instance_id, title, client_id, status, created_at, gear_order_lines(qty_wanted, unit_price, removed), course_instances(course_type, custom_title, client_name)')
      .order('created_at', { ascending: false }),
    admin.from('clients').select(CLIENT_COLUMNS),
    admin.from('gear_lists').select('id, name').eq('is_template', true).order('name'),
  ])

  type Row = {
    id: string; instance_id: string | null; title: string | null; client_id: string | null
    status: GearOrderStatus; created_at: string
    gear_order_lines: { qty_wanted: number | null; unit_price: number | null; removed: boolean }[]
    course_instances: { course_type: string; custom_title: string | null; client_name: string | null } | null
  }
  const orders = (orderRows ?? []) as unknown as Row[]
  const clients = (clientRows ?? []) as ClientRow[]
  const clientOptions = clients
    .filter((c) => !c.is_group)
    .map((c) => ({ id: c.id, label: clientLabel(clients, c.id) }))
    .sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }))

  return (
    <main className="min-h-screen bg-zinc-950 text-white pt-16 md:pt-20">
      <div className="max-w-4xl mx-auto px-4 py-10">
        <Link href="/admin/gear" className="text-sm text-zinc-500 hover:text-zinc-300 transition-colors mb-6 inline-block">← Gear catalog</Link>
        <h1 className="text-2xl font-bold mb-8">Gear orders</h1>

        <NewOrderForm clients={clientOptions} lists={listRows ?? []} />

        <div className="mt-6 space-y-2">
          {orders.map((o) => {
            const course = o.course_instances
            const name = course ? courseShortName(course.course_type, course.custom_title) : o.title
            const who = course ? course.client_name : o.client_id ? clientLabel(clients, o.client_id) : null
            const { total, unpriced, anyPriced } = orderTotal(
              o.gear_order_lines.map((l) => ({ qty: l.qty_wanted, removed: l.removed, unit_price: l.unit_price }))
            )
            return (
              <Link
                key={o.id}
                href={o.instance_id ? `/admin/courses/${o.instance_id}#gear` : `/admin/gear/orders/${o.id}`}
                className="flex items-center gap-3 flex-wrap rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-3 hover:border-zinc-600 transition-colors"
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">{name}</span>
                  <span className="block text-xs text-zinc-500 mt-0.5">
                    {[who, course ? 'course order' : null, `${o.gear_order_lines.length} ${o.gear_order_lines.length === 1 ? 'line' : 'lines'}`].filter(Boolean).join(' · ')}
                  </span>
                </span>
                {anyPriced && (
                  <span className="text-sm text-zinc-300">
                    {fmtMoney(total)}{unpriced > 0 && <span className="text-xs text-amber-300/80"> + {unpriced} unpriced</span>}
                  </span>
                )}
                <span className={`text-[10px] px-2 py-0.5 rounded ${GEAR_ORDER_STATUS_STYLE[o.status]}`}>
                  {GEAR_ORDER_STATUS_LABEL[o.status]}
                </span>
              </Link>
            )
          })}
        </div>
      </div>
    </main>
  )
}
