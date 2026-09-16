'use client'

import { useRouter } from 'next/navigation'
import InvoiceRequestCard from '@/components/InvoiceRequestCard'
import type { InvoiceRequest } from '@/lib/billing'

// The same card the course shows, listed across every course.
//
// This page exists to watch invoices, so it is the last place that should
// have been read-only: it was where you noticed one had gone quiet and the
// only place you could do nothing about it. Each row now carries the two
// milestones and the withdraw, and names its course, which is the one thing
// the course's own copy does not need to say.
export default function RequestList({ requests }: { requests: InvoiceRequest[] }) {
  const router = useRouter()
  return (
    <ul className="space-y-2">
      {requests.map((r) => (
        <li key={r.id}>
          <InvoiceRequestCard
            request={r}
            courseHref={`/portal/${r.instance_id}`}
            onChanged={() => router.refresh()}
          />
        </li>
      ))}
    </ul>
  )
}
