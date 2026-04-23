import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const formData = await request.formData()
  const file = formData.get('file') as File
  const certType = formData.get('cert_type') as string

  if (!file || !certType) {
    return NextResponse.json({ error: 'Missing file or cert_type' }, { status: 400 })
  }

  const admin = createAdminClient()

  const { data: profile } = await admin
    .from('profiles')
    .select('first_name, last_name')
    .eq('id', user.id)
    .single()

  const firstName = profile?.first_name ?? 'unknown'
  const lastName = profile?.last_name ?? 'unknown'
  const instructorSlug = `${firstName}_${lastName}`.replace(/\s+/g, '_')
  const ext = file.name.split('.').pop()
  const timestamp = Date.now()
  const path = `certs/${instructorSlug}/${certType}_${timestamp}.${ext}`

  const bytes = await file.arrayBuffer()
  const buffer = Buffer.from(bytes)

  const { error } = await admin.storage
    .from('cert-documents')
    .upload(path, buffer, { contentType: file.type, upsert: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const { data: urlData } = admin.storage.from('cert-documents').getPublicUrl(path)
  return NextResponse.json({ url: urlData.publicUrl, fileName: file.name })
}
