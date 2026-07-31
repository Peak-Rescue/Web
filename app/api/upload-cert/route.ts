import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { CERT_BUCKET } from '@/lib/cert-docs'
import { CERT_META } from '@/lib/certs'

// Uploads a certification document to the private cert-documents bucket and
// returns its storage path (never a URL — reads go through short-lived signed
// URLs). The upload runs on the service-role client, which bypasses the
// bucket's own policies, so this handler is the only thing between a
// signed-in user and the bucket: it has to do the validating.

const MAX_BYTES = 10 * 1024 * 1024
const EXT_BY_TYPE: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/heic': 'heic',
  'image/heif': 'heif',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const formData = await request.formData()
  const file = formData.get('file')
  const certType = formData.get('cert_type')

  if (!(file instanceof File) || typeof certType !== 'string') {
    return NextResponse.json({ error: 'Missing file or cert_type' }, { status: 400 })
  }
  // Allowlist the cert type — it becomes part of the storage path.
  if (!Object.prototype.hasOwnProperty.call(CERT_META, certType)) {
    return NextResponse.json({ error: 'Unknown certification type' }, { status: 400 })
  }
  if (file.size === 0 || file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'Files must be under 10MB' }, { status: 400 })
  }
  const ext = EXT_BY_TYPE[file.type]
  if (!ext) {
    return NextResponse.json(
      { error: 'Only images (JPG, PNG, HEIC, WebP) and PDFs are accepted' },
      { status: 400 }
    )
  }

  // Path is keyed on the auth user id, not on profile name fields — those are
  // user-editable (so they could target someone else's folder) and collide
  // between people with the same name.
  const path = `certs/${user.id}/${certType}_${Date.now()}.${ext}`

  const admin = createAdminClient()
  const { error } = await admin.storage
    .from(CERT_BUCKET)
    .upload(path, Buffer.from(await file.arrayBuffer()), {
      contentType: file.type,
      upsert: false,
    })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ url: path, fileName: file.name })
}
