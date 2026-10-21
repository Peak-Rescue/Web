import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// The way a library row that IS a file gets read.
//
// The file sits in a private bucket and is reachable only through a signed
// URL that expires in an hour, so the row cannot store a link — it stores the
// path, and this signs one on the way out for whoever is asking. The row's
// `url` points here, which is why every list, picker and course row that
// already renders `item.url` keeps working without knowing any of this.
const DOC_BUCKET = 'task-documents'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.redirect(new URL('/login', process.env.NEXT_PUBLIC_SITE_URL ?? 'https://peak-rescue.com'))

  const admin = createAdminClient()
  const [{ data: item }, { data: profile }] = await Promise.all([
    admin
      .from('library_items')
      .select('storage_path, status, audience, admin_only')
      .eq('id', id)
      .maybeSingle(),
    admin.from('profiles').select('role').eq('id', user.id).single(),
  ])

  if (!item?.storage_path) return new NextResponse('Not found', { status: 404 })

  // The row's own gates, in the order they were built: admin-only is a wall,
  // internal is staff, shared reaches a student because a course put it in
  // front of them. Archived material stays readable to the people who can see
  // the archive, and to nobody else.
  const role = profile?.role ?? ''
  const staff = role === 'admin' || role === 'instructor'
  const allowed = item.admin_only
    ? role === 'admin'
    : staff || (item.audience === 'shared' && item.status === 'published')
  if (!allowed) return new NextResponse('Not allowed', { status: 403 })

  // Short, because the URL is handed to a browser that is about to follow it.
  // A long one is a link that outlives the page it was on.
  const { data: signed, error } = await admin.storage
    .from(DOC_BUCKET)
    .createSignedUrl(item.storage_path, 120)
  if (error || !signed) return new NextResponse('Could not open that file', { status: 502 })

  return NextResponse.redirect(signed.signedUrl)
}
