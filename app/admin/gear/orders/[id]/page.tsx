import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { CLIENT_COLUMNS, clientLabel, type ClientRow } from '@/lib/clients'
import { type GearOrder } from '@/lib/gear-orders'
import OrderEditor from './OrderEditor'

export const metadata = { title: 'Gear order' }

export default async function GearOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound()

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = createAdminClient()
  const { data: profile } = await admin.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') redirect('/dashboard')

  const [{ data: orderRow }, { data: items }, { data: clientRows }] = await Promise.all([
    admin.from('gear_orders')
      .select('id, instance_id, title, client_id, contact_name, contact_email, list_id, es_quote_number, status, accept_token, intro, sent_at, viewed_at, responded_at, responded_name, responded_title, client_note, attachments, gear_order_lines(id, entry_id, gear_item_id, name, detail, category, qty_offered, qty_wanted, url, unit_price, removed, client_note, admin_note, sort_order)')
      .eq('id', id)
      .maybeSingle(),
    admin.from('gear_items')
      .select('id, name, brand, info, url, category, parent_id, aliases, disciplines, price')
      .eq('active', true).order('name'),
    admin.from('clients').select(CLIENT_COLUMNS),
  ])
  if (!orderRow) notFound()
  const order = orderRow as unknown as GearOrder
  if (order.instance_id) redirect(`/admin/courses/${order.instance_id}#gear`)

  const clients = (clientRows ?? []) as ClientRow[]
  const clientOptions = clients
    .filter((c) => !c.is_group)
    .map((c) => ({ id: c.id, label: clientLabel(clients, c.id) }))
    .sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }))

  return (
    <main className="min-h-screen bg-zinc-950 text-white pt-16 md:pt-20">
      <div className="max-w-4xl mx-auto px-4 py-10">
        <Link href="/admin/gear/orders" className="text-sm text-zinc-500 hover:text-zinc-300 transition-colors mb-6 inline-block">← Gear orders</Link>
        <OrderEditor order={order} catalog={items ?? []} clients={clientOptions} />
      </div>
    </main>
  )
}
