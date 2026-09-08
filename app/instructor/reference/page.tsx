import { redirect } from 'next/navigation'

// Reference was the read-only half of the library, on its own route, for the
// people who couldn't reach /admin/library. The library reads for everyone
// now, so this is a forwarding address — the filters come along, because the
// links that point here point at a search someone had already narrowed.

export default async function ReferencePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; discipline?: string; kind?: string; venue?: string; page?: string }>
}) {
  const params = await searchParams
  const q = new URLSearchParams()
  for (const k of ['q', 'discipline', 'kind', 'venue', 'page'] as const) {
    if (params[k]) q.set(k, params[k]!)
  }
  const s = q.toString()
  redirect(s ? `/admin/library?${s}` : '/admin/library')
}
