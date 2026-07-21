import Image from 'next/image'
import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { courseDisplayName, courseShortName } from '@/lib/courses'
import { services, categoryMeta, type ServiceCategory } from '@/lib/data/services'
import { QUOTE_MISSION, QUOTE_COMMITMENT, QUOTE_CONTACT, quoteNumber } from '@/lib/quotes'
import { fmtMoney } from '@/lib/expenses'
import AcceptForm from './AcceptForm'
import PrintTrigger from './PrintTrigger'

// Public, tokenized quote page — the client-facing deliverable. Styled to
// match the public site (dark, red accents, course photography). Printing
// gets a light theme via print: variants so save-as-PDF comes out clean.

export const metadata = { robots: { index: false, follow: false } }

export default async function QuotePage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>
  searchParams: Promise<{ print?: string }>
}) {
  const { token } = await params
  const { print } = await searchParams
  if (!/^[0-9a-f-]{36}$/.test(token)) notFound()

  const admin = createAdminClient()
  const { data: quote } = await admin
    .from('course_quotes')
    .select('*')
    .eq('accept_token', token)
    .maybeSingle()
  if (!quote) notFound()

  const { data: inst } = await admin
    .from('course_instances')
    .select('ref_number, course_type, course_category, custom_title, client_name, location, starts_at, ends_at')
    .eq('id', quote.instance_id)
    .single()
  if (!inst) notFound()

  // First open of a sent quote → record viewed.
  if (quote.status === 'sent' && !quote.viewed_at) {
    await admin.from('course_quotes').update({ viewed_at: new Date().toISOString() }).eq('id', quote.id)
  }

  const service = services.find((s) => s.slug === inst.course_type)
  const heroImage =
    (service as { heroImage?: string } | undefined)?.heroImage ??
    categoryMeta[inst.course_category as ServiceCategory]?.image ??
    '/images/pr_hero.jpeg'

  const qNum = quoteNumber(inst.ref_number, quote.quote_seq)
  const courseName = courseDisplayName(inst.course_type, inst.custom_title)
  const fmtLong = (d: string) =>
    new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
  const dates = inst.starts_at
    ? `${fmtLong(inst.starts_at)}${inst.ends_at && inst.ends_at !== inst.starts_at ? ` – ${fmtLong(inst.ends_at)}` : ''}`
    : 'Dates to be confirmed'

  const today = new Date().toISOString().slice(0, 10)
  const expired = quote.status === 'sent' && quote.valid_until && quote.valid_until < today
  const accepted = quote.status === 'accepted'

  return (
    <main className="min-h-screen bg-zinc-950 text-white print:bg-white print:text-zinc-900">
      {print === '1' && <PrintTrigger />}
      {/* ── Hero ── */}
      <div className="relative overflow-hidden border-b border-white/[0.06] print:border-zinc-300">
        <div className="absolute top-0 left-0 w-16 h-[3px] bg-pr-red z-10" />
        <div className="absolute top-0 left-0 w-[3px] h-16 bg-pr-red z-10" />
        <div className="relative w-full h-72 md:h-[420px] print:h-40">
          <Image src={heroImage} alt={courseName} fill priority className="object-cover object-center" />
          <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-zinc-950/60 to-zinc-950/20 print:hidden" />
        </div>
        <div className="absolute inset-x-0 bottom-0">
          <div className="max-w-3xl mx-auto px-6 pb-10">
            <div className="flex items-center justify-between mb-4">
              <Image src="/logo.png" alt="Peak Rescue" width={150} height={54} className="h-11 w-auto print:hidden" />
              <span className="font-mono text-xs text-zinc-400">{qNum}</span>
            </div>
            <p className="text-pr-red font-semibold tracking-[0.2em] text-sm uppercase mb-2">
              {courseShortName(inst.course_type, inst.custom_title)}
            </p>
            <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-3">Training Quote</h1>
            <p className="text-zinc-300 text-lg">
              Prepared for <span className="font-semibold text-white">{inst.client_name ?? 'your team'}</span>
            </p>
            <p className="text-zinc-400 mt-1">
              {dates}
              {inst.location ? ` · ${inst.location}` : ''}
            </p>
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-6">
        {/* ── Status banners ── */}
        {accepted && (
          <div className="mt-8 p-4 bg-teal-900/30 border border-teal-800 rounded-lg text-teal-200 text-sm print:hidden">
            ✅ This quote was accepted{quote.accepted_name ? ` by ${quote.accepted_name}` : ''}
            {quote.accepted_at ? ` on ${fmtLong(quote.accepted_at.slice(0, 10))}` : ''}. We&apos;ll be in touch about
            next steps — thank you!
          </div>
        )}
        {expired && !accepted && (
          <div className="mt-8 p-4 bg-yellow-900/30 border border-yellow-800 rounded-lg text-yellow-200 text-sm print:hidden">
            This quote expired on {fmtLong(quote.valid_until!)}. Contact us for an updated quote — details below.
          </div>
        )}
        {quote.status === 'draft' && (
          <div className="mt-8 p-4 bg-zinc-900 border border-zinc-700 rounded-lg text-zinc-400 text-sm print:hidden">
            Draft preview — this quote hasn&apos;t been sent yet, so acceptance is disabled.
          </div>
        )}

        {/* ── Overview ── */}
        {quote.course_blurb && (
          <section className="mt-12">
            <h2 className="text-2xl font-bold mb-4">{courseName}</h2>
            <p className="text-zinc-300 leading-relaxed whitespace-pre-wrap print:text-zinc-700">{quote.course_blurb}</p>
          </section>
        )}

        {/* ── The quote ── */}
        <section className="mt-12 p-8 bg-zinc-900 border border-zinc-800 rounded-xl print:bg-white print:border-zinc-300">
          <p className="text-pr-red font-semibold tracking-[0.2em] text-xs uppercase mb-3">Total Price</p>
          <p className="text-5xl font-bold tracking-tight mb-2">{fmtMoney(Number(quote.total))}</p>
          {quote.unit_rate_note && <p className="text-zinc-400 mb-4">{quote.unit_rate_note}</p>}
          {(quote.scope_bullets ?? []).length > 0 && (
            <ul className="mt-6 space-y-2.5">
              {(quote.scope_bullets as string[]).map((b, i) => (
                <li key={i} className="flex gap-3 text-zinc-200 print:text-zinc-700">
                  <span className="text-pr-red mt-0.5">▸</span>
                  <span>{b}</span>
                </li>
              ))}
            </ul>
          )}
          {quote.valid_until && (
            <p className="mt-8 text-sm text-zinc-500">Quote {qNum} · valid through {fmtLong(quote.valid_until)}</p>
          )}
        </section>

        {/* ── Accept ── */}
        {!accepted && !expired && quote.status === 'sent' && (
          <section className="mt-8 p-8 bg-zinc-900 border border-pr-red/40 rounded-xl print:hidden">
            <h2 className="text-xl font-bold mb-1">Ready to lock in these dates?</h2>
            <p className="text-sm text-zinc-400 mb-6">
              Accepting reserves your training dates. Contracting paperwork can follow through your normal channels.
            </p>
            <AcceptForm token={token} clientName={inst.client_name} />
          </section>
        )}

        {/* ── Company + contact ── */}
        <section className="mt-12 grid md:grid-cols-2 gap-10">
          <div>
            <p className="text-pr-red font-semibold tracking-[0.2em] text-xs uppercase mb-3">Our Company</p>
            <p className="text-sm text-zinc-400 leading-relaxed print:text-zinc-700">{QUOTE_MISSION}</p>
          </div>
          <div>
            <p className="text-pr-red font-semibold tracking-[0.2em] text-xs uppercase mb-3">Contact Us</p>
            <div className="text-sm text-zinc-300 space-y-1.5 print:text-zinc-700">
              {quote.prepared_by_name && <p className="font-medium text-white print:text-zinc-900">{quote.prepared_by_name}</p>}
              {quote.prepared_by_email && (
                <p>
                  <a href={`mailto:${quote.prepared_by_email}?subject=${encodeURIComponent(`Quote ${qNum}`)}`} className="hover:text-white underline decoration-zinc-700">
                    {quote.prepared_by_email}
                  </a>
                </p>
              )}
              <p>{QUOTE_CONTACT.phone}</p>
              <p>{QUOTE_CONTACT.website}</p>
            </div>
          </div>
        </section>

        {/* ── Commitment ── */}
        <section className="mt-12 mb-20 pt-10 border-t border-zinc-800 print:border-zinc-300">
          <h2 className="text-xl font-bold mb-4">Our Commitment to You</h2>
          <p className="text-zinc-300 leading-relaxed print:text-zinc-700">{QUOTE_COMMITMENT}</p>
          {quote.prepared_by_name && (
            <div className="mt-8">
              <p className="font-semibold">{quote.prepared_by_name}</p>
              <p className="text-sm text-zinc-500">Peak Rescue Mountain Guides</p>
            </div>
          )}
        </section>
      </div>
    </main>
  )
}
