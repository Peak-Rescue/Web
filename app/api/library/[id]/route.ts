import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { fetchDriveFile, findDriveReader, driveIdFromUrl, driveProxyEnabled } from '@/lib/drive'

// Streams a library item's Drive file to someone the portal has decided may
// see it. Staff get anything published; a student gets an item only if it's
// attached to a course they're enrolled in AND visible to students there.
//
// This is what lets migrated material reach students at all — Classroom shared
// its attachments implicitly, and the portal linking to the same files would
// otherwise land them on Google's request-access screen.

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })

  if (!driveProxyEnabled()) {
    return NextResponse.json({ error: 'Drive access is not configured' }, { status: 503 })
  }

  const admin = createAdminClient()
  const [{ data: profile }, { data: item }] = await Promise.all([
    admin.from('profiles').select('role').eq('id', user.id).single(),
    admin.from('library_items').select('id, url, drive_file_id, status, audience, drive_reader').eq('id', id).maybeSingle(),
  ])

  if (!item || item.status !== 'published') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const isStaff = ['admin', 'instructor'].includes(profile?.role ?? '')

  if (!isStaff) {
    // A student may open it only through a course they're on, and only if it
    // isn't held back to instructors there. Two ways an item lands on a
    // course — as curriculum, or on the resources shelf — and either one
    // earns access, so the check asks both before giving up.
    const [{ data: placements }, { data: resourceRows }] = await Promise.all([
      admin
        .from('course_items')
        .select('audience, course_modules!inner(audience, instance_id)')
        .eq('library_item_id', id),
      admin
        .from('course_resources')
        .select('audience, instance_id')
        .eq('library_item_id', id),
    ])
    type Placement = { audience: string | null; course_modules: { audience: string; instance_id: string } }

    const visible = ((placements ?? []) as unknown as Placement[])
      .filter((p) => {
        const sectionInternal = p.course_modules.audience === 'instructor'
        const itemAudience = p.audience ?? item.audience
        return !sectionInternal && itemAudience !== 'internal'
      })
      .map((p) => p.course_modules.instance_id)
      .concat(
        // The resources shelf has no section above it, so the row's own
        // audience is the whole answer.
        ((resourceRows ?? []) as { audience: string; instance_id: string }[])
          .filter((r) => r.audience === 'shared' && item.audience !== 'internal')
          .map((r) => r.instance_id)
      )
    if (visible.length === 0) return NextResponse.json({ error: 'Not available' }, { status: 403 })

    const { data: enrolled } = await admin
      .from('enrollments')
      .select('id')
      .eq('user_id', user.id)
      .in('instance_id', visible)
      .limit(1)
    if (!enrolled?.length) return NextResponse.json({ error: 'Not available' }, { status: 403 })
  }

  const fileId = item.drive_file_id ?? driveIdFromUrl(item.url)
  if (!fileId) {
    // Not a Drive file — send them to wherever it actually lives.
    if (item.url) return NextResponse.redirect(item.url)
    return NextResponse.json({ error: 'No file' }, { status: 404 })
  }

  let file = await fetchDriveFile(fileId, item.drive_reader ?? undefined)

  // No reader recorded yet, or the recorded one lost access: find a staff
  // account that can see it and remember the answer. Classroom attachments
  // live in the uploader's Drive, so which account works varies per file —
  // resolving on first open beats a migration nobody has to run.
  if (!file.body) {
    const { data: staff } = await admin
      .from('instructors')
      .select('email')
      .eq('active', true)
      .not('email', 'is', null)
    const candidates = [
      ...new Set(
        (staff ?? [])
          .map((s) => s.email as string)
          .filter((e) => e.endsWith('@peak-rescue.com') && e !== item.drive_reader)
      ),
    ]
    const reader = await findDriveReader(fileId, candidates)
    if (reader) {
      await admin.from('library_items').update({ drive_reader: reader }).eq('id', id)
      file = await fetchDriveFile(fileId, reader)
    }
  }

  if (!file.body) {
    return NextResponse.json(
      { error: 'Could not read that file from Drive' },
      { status: file.status === 404 ? 404 : 502 }
    )
  }

  return new NextResponse(file.body, {
    headers: {
      'Content-Type': file.contentType,
      // inline so PDFs and images open in the browser rather than downloading
      'Content-Disposition': `inline; filename="${file.filename.replace(/"/g, '')}"`,
      'Cache-Control': 'private, max-age=300',
    },
  })
}
