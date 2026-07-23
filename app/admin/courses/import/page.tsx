import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { CourseTypeSelect } from '../CourseTypeSelect'
import { importCourseFromEvent, dismissImportedEvent } from './actions'
import { calendarSyncEnabled, listUpcomingEvents, type GcalEvent } from '@/lib/google-calendar'

// One-time migration tool: lists upcoming events on the Google calendars and
// turns each into a portal course with one form. Portal-managed events (and
// anything already imported) are filtered out, so this page empties itself
// as the migration completes.

const inputCls = 'w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-zinc-500'
const labelCls = 'block text-xs text-zinc-400 mb-1'

function fmt(d: string) {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export default async function CalendarImportPage({
  searchParams,
}: {
  searchParams: Promise<{ imported?: string; manual?: string }>
}) {
  const { imported, manual } = await searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = createAdminClient()
  const { data: profile } = await admin.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') redirect('/dashboard')

  // canDelete: the portal owns the three course calendars, so retiring manual
  // events there is fine. The general calendar is read-only to us — course
  // events imported from it must be cleaned up by hand in Google Calendar.
  const sources: { key: string; label: string; calendarId: string | null; canDelete: boolean; defaults: { status: string; category: string } }[] = [
    { key: 'military', label: 'Military Programs', calendarId: process.env.GCAL_MILITARY_CALENDAR_ID ?? null, canDelete: true, defaults: { status: 'confirmed', category: 'tactical' } },
    { key: 'general', label: 'Peak Rescue (general — old civilian courses)', calendarId: process.env.GCAL_GENERAL_CALENDAR_ID ?? null, canDelete: false, defaults: { status: 'confirmed', category: 'sar' } },
    { key: 'civilian', label: 'Civilian Courses', calendarId: process.env.GCAL_CIVILIAN_CALENDAR_ID ?? null, canDelete: true, defaults: { status: 'confirmed', category: 'sar' } },
    { key: 'prospective', label: 'Prospective Classes', calendarId: process.env.GCAL_PROSPECTIVE_CALENDAR_ID ?? null, canDelete: true, defaults: { status: 'tentative', category: 'tactical' } },
  ]

  const enabled = calendarSyncEnabled()
  const [{ data: linked }, { data: importedRows }] = await Promise.all([
    admin.from('course_instances').select('gcal_event_id').not('gcal_event_id', 'is', null),
    // Events already imported from calendars we can't delete from (the general
    // one) are recognized by the event id recorded in the course notes.
    admin.from('course_instances').select('notes').ilike('notes', '%Imported from Google Calendar (event %'),
  ])
  const portalEventIds = new Set((linked ?? []).map((r) => r.gcal_event_id as string))
  for (const r of importedRows ?? []) {
    const m = (r.notes as string | null)?.match(/Imported from Google Calendar \(event ([^)]+)\)/)
    if (m) portalEventIds.add(m[1])
  }

  const lists: { label: string; calendarId: string; canDelete: boolean; events: GcalEvent[] | null }[] = []
  if (enabled) {
    for (const s of sources) {
      if (!s.calendarId) continue
      const events = await listUpcomingEvents(s.calendarId)
      lists.push({
        label: s.label,
        calendarId: s.calendarId,
        canDelete: s.canDelete,
        events:
          events
            ?.filter((e) => !portalEventIds.has(e.id))
            .filter((e) => !(e.description ?? '').includes('managed by the Peak Rescue portal')) ?? null,
      })
    }
  }
  const sourceDefaults = new Map(sources.filter((s) => s.calendarId).map((s) => [s.calendarId!, s.defaults]))

  return (
    <main className="min-h-screen bg-zinc-950 text-white pt-16 md:pt-20">
      <div className="max-w-4xl mx-auto px-4 py-10">
        <Link href="/admin/courses" className="text-sm text-zinc-500 hover:text-zinc-300 transition-colors mb-6 inline-block">
          ← Courses
        </Link>
        <h1 className="text-2xl font-bold mb-1">Calendar Import</h1>
        <p className="text-zinc-400 mb-10 text-sm">
          Upcoming events from the Google calendars that aren&rsquo;t portal courses yet. Importing one creates the
          course, removes the manual event, and lets the portal write its managed replacement. This page empties as
          the migration finishes.
        </p>

        {imported && (
          <p className="mb-8 p-4 bg-green-900/30 border border-green-800 rounded-lg text-green-200 text-sm">
            {manual
              ? 'Course created. The original event is on the general Peak Rescue calendar, which the portal can’t edit — delete it there by hand.'
              : 'Course created and the manual event retired.'}{' '}
            <Link href={`/admin/courses/${imported}`} className="underline hover:text-white">
              Open the course →
            </Link>
          </p>
        )}

        {!enabled && (
          <p className="p-4 bg-yellow-900/30 border border-yellow-800 rounded-lg text-yellow-200 text-sm">
            Calendar sync isn&rsquo;t configured in this environment.
          </p>
        )}

        {lists.map((l) => (
          <section key={l.calendarId} className="mb-10">
            <h2 className="text-lg font-semibold mb-1">{l.label}</h2>
            {l.events === null ? (
              <p className="text-sm text-zinc-500">
                Not readable — share this calendar with the service account (&ldquo;See all event details&rdquo; is
                enough) to import from it.
              </p>
            ) : l.events.length === 0 ? (
              <p className="text-sm text-zinc-500">Nothing left to import ✓</p>
            ) : (
              <div className="space-y-4 mt-3">
                {l.events.map((e) => (
                  <details key={e.id} className="bg-zinc-900 border border-zinc-800 rounded-lg group">
                    <summary className="cursor-pointer list-none px-4 py-3 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{e.summary}</p>
                        <p className="text-xs text-zinc-500 mt-0.5">
                          {fmt(e.start)}
                          {e.end !== e.start ? ` – ${fmt(e.end)}` : ''}
                          {e.location ? ` · ${e.location}` : ''}
                        </p>
                      </div>
                      <span className="shrink-0 text-xs text-zinc-400 group-open:hidden">Import…</span>
                    </summary>
                    <form action={importCourseFromEvent} className="px-4 pb-4 pt-1 grid grid-cols-1 sm:grid-cols-2 gap-4 border-t border-zinc-800">
                      <input type="hidden" name="summary" value={e.summary} />
                      <input type="hidden" name="starts_at" value={e.start} />
                      <input type="hidden" name="ends_at" value={e.end} />
                      <input type="hidden" name="location" value={e.location ?? ''} />
                      <input type="hidden" name="source_calendar_id" value={l.calendarId} />
                      <input type="hidden" name="source_event_id" value={e.id} />

                      <CourseTypeSelect
                        defaultCategory={sourceDefaults.get(l.calendarId)?.category ?? 'tactical'}
                        defaultCustomTitle={e.summary}
                      />
                      <div>
                        <label className={labelCls}>Status</label>
                        <select name="status" defaultValue={sourceDefaults.get(l.calendarId)?.status ?? 'confirmed'} className={inputCls}>
                          <option value="tentative">Tentative</option>
                          <option value="quoted">Quoted</option>
                          <option value="confirmed">Confirmed</option>
                        </select>
                      </div>
                      <div>
                        <label className={labelCls}>Client / organization</label>
                        <input name="client_name" placeholder="e.g. 24th STS" className={inputCls} />
                      </div>
                      <div className="sm:col-span-2">
                        <button className="px-4 py-2 bg-pr-red hover:bg-pr-red-dark text-white rounded text-sm font-medium transition-colors">
                          Import as course →
                        </button>
                      </div>
                    </form>
                    {l.canDelete && (
                      <form action={dismissImportedEvent} className="px-4 pb-3 -mt-1">
                        <input type="hidden" name="source_calendar_id" value={l.calendarId} />
                        <input type="hidden" name="source_event_id" value={e.id} />
                        <button className="text-xs text-zinc-500 hover:text-zinc-300 underline transition-colors">
                          Already in the portal — remove this event
                        </button>
                      </form>
                    )}
                  </details>
                ))}
              </div>
            )}
          </section>
        ))}
      </div>
    </main>
  )
}
