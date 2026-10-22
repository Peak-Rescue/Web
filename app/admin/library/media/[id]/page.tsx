import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { Suspense } from 'react'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { type CourseLink } from '@/lib/course-links'
import { albumSubtitle, albumTitle, type AlbumCourse } from '@/lib/media'
import CourseAlbumSection from '@/app/portal/[id]/CourseAlbumSection'

// One album, on its own.
//
// The media card used to open the course instead, on the argument that the
// lightbox and the uploading already live there and a second gallery would be
// a second thing to keep working. It is the same gallery — the course's own
// component, loaded here — but somebody who clicked an album wanted the
// pictures, not the course that produced them, and landing on a course page
// scrolled to a heading is not that.
export default async function LibraryAlbumPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const admin = createAdminClient()
  const { data: profile } = await admin.from('profiles').select('role').eq('id', user.id).single()
  if (!['admin', 'instructor'].includes(profile?.role ?? '')) redirect('/dashboard')

  const [{ data: course }, { data: linkRows }] = await Promise.all([
    admin
      .from('course_instances')
      .select('id, course_type, custom_title, custom_categories, location, client_name, starts_at, ends_at, ref_number')
      .eq('id', id)
      .single(),
    admin.from('course_links').select('id, url, label, purpose, audience, drive_folder_id').eq('instance_id', id),
  ])
  if (!course) notFound()

  const links = (linkRows ?? []) as CourseLink[]
  const albumRow = links.find((l) => l.drive_folder_id)
  const linked = links.filter((l) => l.purpose === 'photos' && !l.drive_folder_id)

  const c = course as unknown as AlbumCourse

  return (
    // pt-16/20 like every other admin page: the site header is fixed, and a
    // page that forgets it starts underneath the logo.
    <div className="max-w-5xl mx-auto px-4 pt-24 md:pt-28 pb-8">
      <div className="flex items-baseline justify-between gap-4 flex-wrap mb-1">
        <h1 className="text-2xl font-bold">{albumTitle(c)}</h1>
        <Link
          href={`/portal/${id}`}
          className="text-xs text-zinc-500 hover:text-white transition-colors"
        >
          Open the course →
        </Link>
      </div>
      <p className="text-sm text-zinc-500 mb-6">
        {albumSubtitle(c)}
        {' · '}
        <Link href="/admin/library?bucket=media" className="hover:text-zinc-300 transition-colors">
          Photos &amp; video
        </Link>
      </p>

      {/* The course's own album, with its lightbox and its Add button. Only
          an admin manages it from here: the people who can tidy a course's
          album on the course are the ones running it, and that check belongs
          to the course rather than to the library. */}
      <Suspense fallback={<p className="text-sm text-zinc-500">Loading album…</p>}>
        <CourseAlbumSection
          instanceId={id}
          canManage={profile?.role === 'admin'}
          album={
            albumRow?.drive_folder_id
              ? {
                  linkId: albumRow.id,
                  url: albumRow.url,
                  audience: albumRow.audience,
                  folderId: albumRow.drive_folder_id,
                }
              : null
          }
          linked={linked}
        />
      </Suspense>
    </div>
  )
}
