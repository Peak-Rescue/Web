import { redirect } from 'next/navigation'

// The course editor, which the course page absorbed.
//
// Everything this held is reachable from /portal/[id] now — the details form
// with its date painter, staffing, students and their invite link, the gear
// list, the curriculum, maps, resources, files, the schedule, quotes. Nothing
// linked here any more; the only way in was the redirect after creating a
// course, which is how a new course kept opening on the old page with the old
// date fields on it while the painter sat on the new one.
//
// Kept as a redirect rather than deleted so a bookmark or a browser history
// entry lands somewhere useful.
export default async function CourseInstancePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  redirect(`/portal/${id}`)
}
