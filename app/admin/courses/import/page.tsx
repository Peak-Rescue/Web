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

// Google event descriptions are HTML-ish; course notes are plain text. Flatten
// links to "label (url)" so nothing is lost.
function htmlToText(s: string): string {
  if (!/[<&]/.test(s)) return s
  return s
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li)>/gi, '\n')
    .replace(/<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, (_, href, label) => {
      const text = label.replace(/<[^>]+>/g, '').trim()
      return text && text !== href ? `${text} (${href})` : href
    })
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

// Event description + attached files, as the default course notes.
function eventNotes(e: GcalEvent): string {
  const files = e.attachments.map((a) => `${a.title}: ${a.url}`).join('\n')
  return [e.description ? htmlToText(e.description) : '', files].filter(Boolean).join('\n\n')
}

// Manual events carry crew first names in the title ("… — Micah, Nadav"), so
// instructors whose first name appears there get pre-selected, in title order
// (the team convention lists the lead first).
function matchCrew(summary: string, instructors: { id: string; name: string }[]): string[] {
  const s = summary.toLowerCase()
  return instructors
    .map((i) => {
      const first = i.name.split(' ')[0].toLowerCase()
      const safe = first.replace(/[.*+?^${}()|[\]\\]/g, '')
      return { id: i.id, idx: safe.length >= 3 ? s.search(new RegExp(`\\b${safe}\\b`)) : -1 }
    })
    .filter((m) => m.idx >= 0)
    .sort((a, b) => a.idx - b.idx)
    .map((m) => m.id)
}

export default async function CalendarImportPage({
  searchParams,
}: {
  searchParams: Promise<{ imported?: string }>
}) {
  const { imported } = await searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = createAdminClient()
  const { data: profile } = await admin.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') redirect('/dashboard')

  // The portal has write access everywhere (service account is a writer on the
  // general admin calendar too), so every import retires its manual original.
  // Admin-only reminders on the general calendar ("Hours Due") are filtered
  // from the listing and simply stay there — importing the course events out
  // leaves it as a pure admin calendar.
  const sources: { key: string; label: string; calendarId: string | null; defaults: { status: string; category: string } }[] = [
    { key: 'military', label: 'Military Programs', calendarId: process.env.GCAL_MILITARY_CALENDAR_ID ?? null, defaults: { status: 'confirmed', category: 'tactical' } },
    { key: 'civilian', label: 'Civilian Courses', calendarId: process.env.GCAL_CIVILIAN_CALENDAR_ID ?? null, defaults: { status: 'confirmed', category: 'sar' } },
    { key: 'general', label: 'Peak Rescue (admin) — legacy course events', calendarId: process.env.GCAL_GENERAL_CALENDAR_ID ?? null, defaults: { status: 'confirmed', category: 'sar' } },
    { key: 'prospective', label: 'Prospective Classes', calendarId: process.env.GCAL_PROSPECTIVE_CALENDAR_ID ?? null, defaults: { status: 'tentative', category: 'tactical' } },
  ]

  const enabled = calendarSyncEnabled()
  const [{ data: linked }, { data: importedRows }, { data: instructorRows }] = await Promise.all([
    admin.from('course_instances').select('gcal_event_id').not('gcal_event_id', 'is', null),
    // Already-imported events whose manual copy outlived the import (e.g.
    // imported from the old read-only general calendar, then moved here) are
    // recognized by the event id recorded in the course notes — Google keeps
    // the id when an event moves between calendars.
    admin.from('course_instances').select('notes').ilike('notes', '%Imported from Google Calendar (event %'),
    admin.from('instructors').select('id, name').order('name'),
  ])
  const instructors = instructorRows ?? []
  const portalEventIds = new Set((linked ?? []).map((r) => r.gcal_event_id as string))
  for (const r of importedRows ?? []) {
    const m = (r.notes as string | null)?.match(/Imported from Google Calendar \(event ([^)]+)\)/)
    if (m) portalEventIds.add(m[1])
  }

  const lists: { label: string; calendarId: string; events: GcalEvent[] | null }[] = []
  if (enabled) {
    for (const s of sources) {
      if (!s.calendarId) continue
      const events = await listUpcomingEvents(s.calendarId)
      lists.push({
        label: s.label,
        calendarId: s.calendarId,
        events:
          events
            ?.filter((e) => !portalEventIds.has(e.id))
            .filter((e) => !(e.description ?? '').includes('managed by the Peak Rescue portal'))
            // Payroll reminders on the admin calendar — never courses.
            .filter((e) => !/^hours due$/i.test(e.summary.trim())) ?? null,
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
            Course created and the manual event retired.{' '}
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
                      <div>
                        <label className={labelCls}>Location</label>
                        <input name="location" defaultValue={e.location ?? ''} placeholder="e.g. Saint George, UT" className={inputCls} />
                      </div>
                      <div className="sm:col-span-2">
                        <label className={labelCls}>Notes</label>
                        <textarea
                          name="notes"
                          defaultValue={eventNotes(e)}
                          rows={eventNotes(e) ? Math.min(8, Math.max(3, eventNotes(e).split('\n').length + 1)) : 2}
                          placeholder="Carried into the course notes (visible to admins and instructors)"
                          className={`${inputCls} resize-y`}
                        />
                        {e.attachments.length > 0 && (
                          <p className="text-[11px] text-zinc-500 mt-1">
                            Includes {e.attachments.length} attached file{e.attachments.length > 1 ? 's' : ''} from the event — the links keep working after import.
                          </p>
                        )}
                      </div>
                      {instructors.length > 0 && (() => {
                        const matched = matchCrew(e.summary, instructors)
                        const assists = new Set(matched.slice(1))
                        return (
                          <>
                            <div>
                              <label className={labelCls}>Lead instructor</label>
                              <select name="lead_instructor_id" defaultValue={matched[0] ?? ''} className={inputCls}>
                                <option value="">None yet</option>
                                {instructors.map((i) => (
                                  <option key={i.id} value={i.id}>{i.name}</option>
                                ))}
                              </select>
                            </div>
                            <div className="sm:col-span-2">
                              <label className={labelCls}>Assisting instructors</label>
                              <div className="flex flex-wrap gap-x-4 gap-y-2 p-3 bg-zinc-800/50 border border-zinc-700 rounded">
                                {instructors.map((i) => (
                                  <label key={i.id} className="flex items-center gap-1.5 text-sm text-zinc-300 cursor-pointer">
                                    <input
                                      type="checkbox"
                                      name="assist_instructor_ids"
                                      value={i.id}
                                      defaultChecked={assists.has(i.id)}
                                      className="accent-red-600"
                                    />
                                    {i.name}
                                  </label>
                                ))}
                              </div>
                              {matched.length > 0 && (
                                <p className="text-[11px] text-zinc-500 mt-1">
                                  Pre-selected from names in the event title (first name listed → lead) — adjust before importing.
                                </p>
                              )}
                            </div>
                          </>
                        )
                      })()}
                      <div className="sm:col-span-2">
                        <button className="px-4 py-2 bg-pr-red hover:bg-pr-red-dark text-white rounded text-sm font-medium transition-colors">
                          Import as course →
                        </button>
                      </div>
                    </form>
                    <form action={dismissImportedEvent} className="px-4 pb-3 -mt-1">
                      <input type="hidden" name="source_calendar_id" value={l.calendarId} />
                      <input type="hidden" name="source_event_id" value={e.id} />
                      <button className="text-xs text-zinc-500 hover:text-zinc-300 underline transition-colors">
                        Already in the portal — remove this event
                      </button>
                    </form>
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
