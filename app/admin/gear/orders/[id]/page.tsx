import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { CLIENT_COLUMNS, type ClientRow } from '@/lib/clients'
import { type GearOrder } from '@/lib/gear-orders'
import { courseShortName } from '@/lib/courses'
import { quoteNumber } from '@/lib/quotes'
import { parseContacts, primaryContactEmail } from '@/lib/contacts'
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
      .select('id, instance_id, for_instance_id, title, client_id, contacts, list_id, es_quote_number, status, accept_token, intro, sent_at, viewed_at, responded_at, responded_name, responded_title, client_note, attachments, split_from, split_cap, discount_percent, cost_percent, gear_order_lines(id, entry_id, gear_item_id, name, product, detail, category, qty_offered, qty_wanted, url, unit_price, discount_percent, cost_percent, size_options, sizes, removed, checked, client_note, admin_note, sort_order, gear_items(brand))')
      .eq('id', id)
      .maybeSingle(),
    admin.from('gear_items')
      .select('id, name, brand, info, url, category, parent_id, aliases, disciplines, price, sizes')
      .eq('active', true).order('name'),
    admin.from('clients').select(CLIENT_COLUMNS),
  ])
  if (!orderRow) notFound()
  const order = orderRow as unknown as GearOrder
  if (order.instance_id) redirect(`/admin/courses/${order.instance_id}#gear`)

  const clients = (clientRows ?? []) as ClientRow[]
  // A quote made for a course goes back to that course's pricing, where it
  // was started and where it is listed.
  const forId = (orderRow as unknown as { for_instance_id: string | null }).for_instance_id
  const [{ data: forCourse }, { data: draftQuotes }] = forId
    ? await Promise.all([
        admin.from('course_instances').select('id, course_type, custom_title, ref_number, contacts').eq('id', forId).maybeSingle(),
        admin.from('course_quotes').select('id, quote_seq')
          .eq('instance_id', forId).eq('status', 'draft').is('archived_at', null).order('quote_seq'),
      ])
    : [{ data: null }, { data: null }]
  // Draft course quotes this order can go out with, in the one email.
  const courseQuotes = forCourse
    ? (draftQuotes ?? []).map((q) => ({ id: q.id as string, label: quoteNumber(forCourse.ref_number as number, q.quote_seq as number) }))
    : []
  const courseContact = forCourse ? primaryContactEmail(parseContacts(forCourse.contacts)) : null

  return (
    <main className="min-h-screen bg-zinc-950 text-white pt-16 md:pt-20">
      <div className="max-w-4xl mx-auto px-4 py-10">
        {forCourse ? (
          <Link href={`/portal/${forCourse.id}?mode=build&open=pricing`} className="text-sm text-zinc-500 hover:text-zinc-300 transition-colors mb-6 inline-block">
            ← {courseShortName(forCourse.course_type as string, forCourse.custom_title as string | null)} pricing
          </Link>
        ) : (
          <Link href="/admin/gear/orders" className="text-sm text-zinc-500 hover:text-zinc-300 transition-colors mb-6 inline-block">← Gear orders</Link>
        )}
        <OrderEditor
          order={order}
          catalog={items ?? []}
          clients={clients}
          courseQuotes={courseQuotes}
          courseContact={courseContact}
          backTo={forCourse ? `/portal/${forCourse.id}?mode=build&open=pricing` : '/admin/gear/orders'}
        />
      </div>
    </main>
  )
}
