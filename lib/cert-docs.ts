// Certification documents (medical cards, SPRAT/EMT certs — identity
// documents) live in the private `cert-documents` bucket and are only ever
// handed out as short-lived signed URLs.
//
// History: the bucket was public and rows stored the permanent public URL, so
// anyone with (or guessing) a URL could read a staff member's medical card.
// The bucket is private now; `instructor_cert_documents.url` stores a bare
// storage path for new uploads, and these helpers still accept the legacy
// public-URL rows so old documents keep working.

import { type createAdminClient } from '@/lib/supabase/admin'

export const CERT_BUCKET = 'cert-documents'

const PUBLIC_MARKER = `/object/public/${CERT_BUCKET}/`
const SIGN_MARKER = `/object/sign/${CERT_BUCKET}/`

// Storage path for a stored value, whether it's a bare path (current) or a
// legacy public/signed URL. Returns null if it doesn't belong to our bucket —
// which also makes this the validator for caller-supplied values.
export function certDocPath(stored: string): string | null {
  if (!stored) return null
  if (!stored.includes('://')) {
    const path = stored.replace(/^\/+/, '')
    return path.startsWith('certs/') ? path : null
  }
  try {
    const { pathname } = new URL(stored)
    for (const marker of [PUBLIC_MARKER, SIGN_MARKER]) {
      const idx = pathname.indexOf(marker)
      if (idx !== -1) return decodeURIComponent(pathname.slice(idx + marker.length))
    }
  } catch {
    return null
  }
  return null
}

type Admin = ReturnType<typeof createAdminClient>
type DocRow = { id: string; url: string; file_name: string }

const SIGNED_URL_TTL_SECONDS = 60 * 60

// Swaps each doc's stored value for a signed URL (batched, one request).
// Docs whose path can't be resolved get an empty url rather than a broken
// link — the UI already treats those as unavailable.
export async function signCertDocs<T extends DocRow>(
  admin: Admin,
  docs: T[]
): Promise<T[]> {
  if (docs.length === 0) return docs
  const paths = docs.map((d) => certDocPath(d.url))
  const wanted = [...new Set(paths.filter((p): p is string => Boolean(p)))]
  if (wanted.length === 0) return docs.map((d) => ({ ...d, url: '' }))

  const { data } = await admin.storage
    .from(CERT_BUCKET)
    .createSignedUrls(wanted, SIGNED_URL_TTL_SECONDS)

  const byPath = new Map((data ?? []).map((r) => [r.path, r.signedUrl]))
  return docs.map((d, i) => {
    const p = paths[i]
    return { ...d, url: (p && byPath.get(p)) || '' }
  })
}
