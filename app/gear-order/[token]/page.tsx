import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { viewerIsAdmin } from '@/lib/course-access'
import { courseShortName } from '@/lib/courses'
import { type GearOrderLine } from '@/lib/gear-orders'
import GearOrderForm from './GearOrderForm'

// Public, tokenized gear list — the client says what they actually want us to
// supply. Deliberately re-openable: the same link after a phone call is how the
// second pass happens.

export const metadata = { robots: { index: false, follow: false } }

export default async function GearOrderPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  if (!/^[0-9a-f-]{36}$/.test(token)) notFound()

  const admin = createAdminClient()
  const { data: order } = await admin
    .from('gear_orders')
    .select('id, instance_id, es_quote_number, status, intro, responded_at, responded_name, client_note, viewed_at, gear_order_lines(id, name, detail, category, qty_offered, qty_wanted, removed, client_note, sort_order)')
    .eq('accept_token', token)
    .maybeSingle()
  if (!order || order.status === 'draft') notFound()

  const { data: inst } = await admin
    .from('course_instances')
    .select('course_type, custom_title, client_name, starts_at, ends_at, location')
    .eq('id', order.instance_id)
    .single()
  if (!inst) notFound()

  // Our own preview of the client's page doesn't count as the client's open.
  if (!order.viewed_at && !(await viewerIsAdmin(admin))) {
    await admin.from('gear_orders').update({ viewed_at: new Date().toISOString() }).eq('id', order.id)
  }

  const courseName = courseShortName(inst.course_type, inst.custom_title)
  const lines = ([...(order.gear_order_lines ?? [])] as GearOrderLine[]).sort((a, b) => a.sort_order - b.sort_order)
  const dates = inst.starts_at
    ? `${inst.starts_at}${inst.ends_at && inst.ends_at !== inst.starts_at ? ` – ${inst.ends_at}` : ''}`
    : null

  return (
    <main className="min-h-screen bg-zinc-950 text-white">
      <div className="max-w-3xl mx-auto px-4 py-12 md:py-16">
        <p className="text-xs uppercase tracking-[0.2em] text-pr-red mb-2">Peak Rescue Mountain Guides</p>
        <h1 className="text-2xl md:text-3xl font-bold">Gear list — {courseName}</h1>
        <p className="text-sm text-zinc-400 mt-1">
          {[inst.client_name, dates, inst.location].filter(Boolean).join(' · ')}
        </p>
        {order.es_quote_number && (
          <p className="mt-3 inline-block text-sm font-mono px-2.5 py-1 rounded bg-zinc-900 border border-zinc-800 text-zinc-300">
            Quote {order.es_quote_number}
          </p>
        )}

        {order.intro && <p className="text-sm text-zinc-300 mt-6 whitespace-pre-line leading-relaxed">{order.intro}</p>}

        <div className="mt-8 rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
          <p className="text-sm text-zinc-300">
            Set the quantity you want for each item. Use <span className="text-zinc-100">Not needed</span> for anything
            you already have, and leave a note on any line you want to talk about. Whatever you send back is what we
            pass to our purchasing team.
          </p>
          {order.responded_at && (
            <p className="text-xs text-teal-300 mt-3">
              You answered this on {new Date(order.responded_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
              {order.responded_name ? ` as ${order.responded_name}` : ''}. You can change it and send it again.
            </p>
          )}
        </div>

        <GearOrderForm
          token={token}
          lines={lines}
          alreadyAnswered={Boolean(order.responded_at)}
          defaultNote={order.client_note ?? ''}
          defaultName={order.responded_name ?? ''}
        />

        <p className="text-xs text-zinc-600 mt-10">
          Questions? Reply to the email this link came in on
          {order.es_quote_number ? `, quoting ${order.es_quote_number}` : ''}.
        </p>
      </div>
    </main>
  )
}
