'use client'

import Link from 'next/link'
import QuoteSendForm from './QuoteSendForm'
import { sendQuote, setQuoteStatus } from './finance-actions'
import { fmtMoney } from '@/lib/expenses'
import { btn } from '@/lib/ui'
import type { QuoteQuickData } from './quick-actions'

// Sending a quote that is already written, from the list.
//
// Deliberately only the send: the lines, the wording, the photo and every
// other decision about what a quote says stay on the course, behind Pricing.
// What is worth doing from a list is the last step — the one where nothing is
// left to decide and the quote is just sitting there.
export default function QuoteQuickSend({ data }: { data: QuoteQuickData }) {
  const { instanceId, drafts, contactEmail, ccOptions, adminCcOptions } = data

  if (drafts.length === 0) {
    return (
      <p className="text-sm text-zinc-500">
        No draft quote to send.{' '}
        <Link href={`/portal/${instanceId}?open=pricing`} prefetch={false} className="text-zinc-300 underline underline-offset-2 hover:text-white">
          Open pricing
        </Link>{' '}
        to price the course and draw one up.
      </p>
    )
  }

  return (
    <div className="space-y-3">
      {drafts.map((q) => (
        <div key={q.id} className="flex items-center gap-3 flex-wrap">
          <span className="text-xs font-mono text-zinc-400">{q.number}</span>
          <span className="text-sm font-medium">{fmtMoney(q.total)}</span>
          <a
            href={`/quote/${q.acceptToken}`}
            target="_blank"
            rel="noopener noreferrer"
            title="The page the client would see"
            className="text-xs text-zinc-500 hover:text-zinc-300 underline underline-offset-2"
          >
            Preview ↗
          </a>
          <div className="flex-1" />
          {contactEmail ? (
            <QuoteSendForm
              action={sendQuote.bind(null, instanceId, q.id)}
              contactEmail={contactEmail}
              ccOptions={ccOptions}
              adminCcOptions={adminCcOptions}
            />
          ) : (
            <span className="text-xs text-zinc-600" title="Add a point-of-contact email in Details to send from here">
              no POC email
            </span>
          )}
          {/* For one that went out some other way — over the phone, or from
              somebody's own mail. */}
          <form action={setQuoteStatus.bind(null, instanceId, q.id, 'sent')}>
            <button className={btn.secondary}>Mark sent</button>
          </form>
        </div>
      ))}
      <p className="text-xs text-zinc-600">
        What the quote says — its lines, its wording, the photo on it — is edited on the course, under{' '}
        <Link href={`/portal/${instanceId}?open=pricing`} prefetch={false} className="text-zinc-400 underline underline-offset-2 hover:text-white">
          Pricing
        </Link>.
      </p>
    </div>
  )
}
