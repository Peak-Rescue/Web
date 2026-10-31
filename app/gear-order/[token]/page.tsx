import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { viewerIsAdmin } from '@/lib/course-access'
import { courseShortName } from '@/lib/courses'
import { CLIENT_COLUMNS, clientLabel, type ClientRow } from '@/lib/clients'
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
    .select('id, instance_id, title, client_id, discount_percent, es_quote_number, status, intro, responded_at, responded_name, client_note, viewed_at, attachments, gear_order_lines(id, name, product, detail, category, qty_offered, qty_wanted, url, unit_price, discount_percent, size_options, sizes, removed, client_note, sort_order)')
    .eq('accept_token', token)
    .maybeSingle()
  if (!order) notFound()

  // A draft is nobody's to see but ours: an admin gets the team's page, so what
  // it will say can be read before it goes.
  const isAdmin = await viewerIsAdmin(admin)
  if (order.status === 'draft' && !isAdmin) notFound()

  // The bucket is private and a token page is not a login, so each file gets
  // its own short-lived URL rather than the client being sent to storage.
  const files = (order.attachments ?? []) as { path: string; filename: string }[]
  const { data: signed } = files.length
    ? await admin.storage.from('task-documents').createSignedUrls(files.map((f) => f.path), 3600)
    : { data: [] }
  const signedByPath = new Map((signed ?? []).map((x) => [x.path, x.signedUrl]))

  // An order with no course names itself and says who it is for.
  let heading = order.title ?? 'Gear list'
  let subheading: (string | null)[] = []
  if (order.instance_id) {
    const { data: inst } = await admin
      .from('course_instances')
      .select('course_type, custom_title, client_name, starts_at, ends_at, location')
      .eq('id', order.instance_id)
      .single()
    if (!inst) notFound()
    heading = courseShortName(inst.course_type, inst.custom_title)
    const dates = inst.starts_at
      ? `${inst.starts_at}${inst.ends_at && inst.ends_at !== inst.starts_at ? ` – ${inst.ends_at}` : ''}`
      : null
    subheading = [inst.client_name, dates, inst.location]
  } else if (order.client_id) {
    const { data: clients } = await admin.from('clients').select(CLIENT_COLUMNS)
    subheading = [clientLabel((clients ?? []) as ClientRow[], order.client_id) || null]
  }
  const standalone = !order.instance_id

  // Our own preview of the client's page doesn't count as the client's open.
  if (!order.viewed_at && !isAdmin) {
    await admin.from('gear_orders').update({ viewed_at: new Date().toISOString() }).eq('id', order.id)
  }

  const lines = ([...(order.gear_order_lines ?? [])] as GearOrderLine[]).sort((a, b) => a.sort_order - b.sort_order)

  return (
    <main className="min-h-screen bg-zinc-950 text-white">
      <div className="max-w-3xl mx-auto px-4 py-12 md:py-16">
        {isAdmin && (
          <p className="mb-6 rounded border border-amber-800 bg-amber-950/40 px-3 py-2 text-sm text-amber-200">
            {order.status === 'draft'
              ? 'Draft preview. This hasn’t been sent yet, so it can’t be answered.'
              : 'You’re viewing the team’s page as an admin.'}
          </p>
        )}
        <p className="text-xs uppercase tracking-[0.2em] text-pr-red mb-2">Peak Rescue</p>
        <h1 className="text-2xl md:text-3xl font-bold">Gear list — {heading}</h1>
        <p className="text-sm text-zinc-400 mt-1">
          {subheading.filter(Boolean).join(' · ')}
        </p>
        {order.es_quote_number && (
          <p className="mt-3 inline-block text-sm font-mono px-2.5 py-1 rounded bg-zinc-900 border border-zinc-800 text-zinc-300">
            Quote {order.es_quote_number}
          </p>
        )}

        {order.intro && <p className="text-sm text-zinc-300 mt-6 whitespace-pre-line leading-relaxed">{order.intro}</p>}

        {files.length > 0 && (
          <div className="mt-5">
            <p className="text-[11px] uppercase tracking-widest text-zinc-500 mb-2">Sent with this</p>
            <div className="flex flex-wrap gap-2">
              {files.map((f) => (
                <a
                  key={f.path}
                  href={signedByPath.get(f.path) ?? '#'}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 px-3 py-1.5 rounded border border-zinc-700 text-sm text-zinc-200 hover:border-zinc-500 hover:text-white transition-colors"
                >
                  <svg aria-hidden xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" />
                  </svg>
                  {f.filename}
                </a>
              ))}
            </div>
          </div>
        )}

        <div className="mt-8 rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
          <p className="text-sm text-zinc-300">
            Set the quantity you want for each item. Use <span className="text-zinc-100">Not needed</span> for anything
            you already have, and leave a note on any line you want to talk about.
            {standalone ? ' Whatever you send back comes straight to us.' : ' Whatever you send back is what we pass to our purchasing team.'}
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
          standalone={standalone}
          draft={order.status === 'draft'}
          orderDiscount={order.discount_percent}
        />

        <p className="text-xs text-zinc-600 mt-10">
          Questions? Reply to the email this link came in on
          {order.es_quote_number ? `, quoting ${order.es_quote_number}` : ''}.
        </p>
      </div>
    </main>
  )
}
