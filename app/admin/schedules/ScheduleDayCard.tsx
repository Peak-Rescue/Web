'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { updateScheduleDay, removeScheduleDay } from './actions'
import DayOutline from './DayOutline'
import { Grows, Marked, PinIcon, RouteIcon, FlagIcon, NoteIcon, TargetIcon, PencilIcon } from './fields'
import type { ScheduleDay, SiteOption, MeetingPointOption } from './types'
import { useTrackedSaves } from '@/components/PendingSaves'

// One day of a running order, as a thing you can edit wherever you meet it.
//
// It was inline in ScheduleEditor, which meant editing a day required putting
// the whole schedule into edit mode from a button at the top of the section —
// a long way from the day you were actually looking at. Now the same markup
// serves both: the full editor lays these out in order, and the course page
// opens one under the day you are reading.
//
// Everything saves on blur, and quietly: the fields are uncontrolled, so what
// you typed is already on screen and re-rendering the page behind them is a
// second of work nobody asked for.
export default function ScheduleDayCard({
  day,
  sites = [],
  meetingPoints = [],
  venueId = null,
  onRemoving,
  onRemoveFailed,
  onError,
}: {
  day: ScheduleDay
  sites?: SiteOption[]
  meetingPoints?: MeetingPointOption[]
  venueId?: string | null
  /** The list, if there is one, takes the day off screen on the click rather
      than on the round trip — and puts it back if the server disagreed. */
  onRemoving?: (id: string) => void
  onRemoveFailed?: (id: string) => void
  onError?: (message: string | null) => void
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function fail(message: string | null) {
    setError(message)
    onError?.(message)
  }

  // Blur fires on the mousedown that closes this card's editor; tracking the
  // save keeps the close from re-reading the page before it lands.
  const track = useTrackedSaves()

  async function run(fn: () => Promise<unknown>, opts?: { quiet?: boolean }) {
    setBusy(true); fail(null)
    try { await track(fn()); if (!opts?.quiet) router.refresh(); return true }
    catch (e) { fail(e instanceof Error ? e.message : 'That didn’t save'); return false }
    finally { setBusy(false) }
  }

  const input = 'bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-sm focus:outline-none focus:border-zinc-500'

  const site = sites.find((s) => s.id === day.site_id)
  // What the day falls back to, named rather than left blank: an empty picker
  // that silently means "the lower lot" is a picker nobody trusts.
  const siteMeetupName = site?.meeting_point_id
    ? meetingPoints.find((p) => p.id === site.meeting_point_id)?.name ?? null
    : null

  // The course's own venue first, then everywhere else — the list is one
  // dropdown, so the ordering is the only thing making a Maui course feel like
  // it knows it's on Maui.
  const siteGroups = useMemo(() => {
    const here = sites.filter((s) => venueId && s.venue_id === venueId)
    const rest = sites.filter((s) => !here.includes(s))
    const restBy = new Map<string, SiteOption[]>()
    for (const s of rest) {
      const k = s.venue_name ?? 'Elsewhere'
      restBy.set(k, [...(restBy.get(k) ?? []), s])
    }
    return [
      ...(here.length ? [{ name: 'This course’s venue', sites: here }] : []),
      ...[...restBy.entries()].map(([name, sites]) => ({ name, sites })),
    ]
  }, [sites, venueId])

  return (
    <>
      {error && <p className="text-sm text-pr-red mb-2">{error}</p>}
  <div className="border border-zinc-800 rounded-lg overflow-hidden">
    <div className="bg-zinc-900 px-3 py-2 space-y-2">
      <div className="flex items-center gap-2">
        <input
          defaultValue={day.title}
          onBlur={(e) => e.target.value !== day.title && run(() => updateScheduleDay(day.id, { title: e.target.value }), { quiet: true })}
          placeholder="Day 1: Basic rope skills"
          className={`flex-1 font-medium ${input}`}
        />
        <button
          onClick={() => {
            if (!confirm(`Remove "${day.title}"?`)) return
            onRemoving?.(day.id)
            void run(() => removeScheduleDay(day.id)).then((ok) => {
              if (!ok) onRemoveFailed?.(day.id)
            })
          }}
          className="shrink-0 text-xs text-zinc-600 hover:text-red-400 transition-colors"
        >
          Remove day
        </button>
      </div>
      <div className="grid sm:grid-cols-2 gap-2">
        <Marked icon={<PinIcon />}>
          <input
            defaultValue={day.location ?? ''}
            onBlur={(e) => e.target.value !== (day.location ?? '') && run(() => updateScheduleDay(day.id, { location: e.target.value }), { quiet: true })}
            placeholder="Location"
            className={`w-full pl-7 ${input}`}
          />
        </Marked>
        {/* Picking the canyon is what stops its beta being retyped per
            course. Left unset, the day behaves exactly as it always
            has — a free-text location and its own notes. */}
        {sites.length > 0 && (
          <Marked icon={<RouteIcon />}>
            <select
              value={day.site_id ?? ''}
              onChange={(e) => run(() => updateScheduleDay(day.id, { site_id: e.target.value || null }))}
              className={`w-full pl-7 ${input} ${day.site_id ? 'text-zinc-200' : 'text-zinc-500'}`}
            >
              <option value="">No site</option>
              {siteGroups.map((g) => (
                <optgroup key={g.name} label={g.name}>
                  {g.sites.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}{s.kind ? ` · ${s.kind}` : ''}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </Marked>
        )}
        {meetingPoints.length > 0 && (
          <Marked icon={<FlagIcon />}>
            <select
              value={day.meeting_point_id ?? ''}
              onChange={(e) => run(() => updateScheduleDay(day.id, { meeting_point_id: e.target.value || null }))}
              className={`w-full pl-7 ${input} ${day.meeting_point_id ? 'text-zinc-200' : 'text-zinc-500'}`}
            >
              <option value="">
                {siteMeetupName ? `Meet at ${siteMeetupName}` : 'Meeting point'}
              </option>
              {meetingPoints.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </Marked>
        )}
      </div>
      {/* The beta as the day will show it, read-only here: this is the
          site's, and editing it belongs on the site, where the fix
          reaches every other course too. */}
      {/* The beta as the day will show it, read-only here: this is the
          site's, and editing it belongs on the site, where the fix
          reaches every other course too. */}
      {(() => {
        if (!site?.beta) return null
        return (
          <div className="rounded border border-zinc-800 bg-zinc-950/60 px-2.5 py-2">
            <div className="flex items-start gap-2 mb-1">
              <p className="text-[10px] uppercase tracking-wide text-zinc-600 min-w-0 flex-1 pt-0.5">
                Beta from {site.name}
              </p>
              {/* The way out of a read-only block, and the only reason
                  anyone is looking at this one twice. Buried mid-caption
                  after the site's name it landed somewhere different on
                  every day, so it sits at a fixed corner instead — and
                  opens the site already expanded rather than dropping
                  you on a list of collapsed rows to hunt through. */}
              <a
                href={`/admin/sites#site-${site.id}`}
                target="_blank"
                rel="noopener"
                title={`Edit ${site.name}'s beta — changes it on every course`}
                className="shrink-0 inline-flex items-center gap-1 rounded border border-zinc-700 px-1.5 py-0.5 text-[10px] text-zinc-400 hover:text-white hover:border-zinc-500 transition-colors"
              >
                <PencilIcon />
                Edit beta
              </a>
            </div>
            <p className="text-[11px] text-zinc-500 whitespace-pre-line leading-relaxed line-clamp-6">{site.beta}</p>
          </div>
        )
      })()}
      {/* A day at a canyon carries its beta here — approach, rap count,
          exit — so this one starts a line tall and grows to whatever got
          pasted in. Sitting half-width beside the location, a paragraph
          of it was a keyhole. */}
      <Marked icon={<NoteIcon />} top>
        <Grows
          defaultValue={day.notes ?? ''}
          onBlur={(e) => e.target.value !== (day.notes ?? '') && run(() => updateScheduleDay(day.id, { notes: e.target.value }), { quiet: true })}
          placeholder="Notes"
          className={`w-full pl-7 ${input}`}
        />
      </Marked>
      {/* What the day is for, as opposed to what happens on it — the
          course objectives are too coarse to teach a Tuesday from. */}
      <Marked icon={<TargetIcon />} top>
        <textarea
          defaultValue={day.objectives.join('\n')}
          onBlur={(e) => {
            const next = e.target.value.split('\n').map((o) => o.trim()).filter(Boolean)
            if (next.join('\n') !== day.objectives.join('\n')) {
              run(() => updateScheduleDay(day.id, { objectives: next }), { quiet: true })
            }
          }}
          rows={2}
          placeholder="Objectives, one per line"
          className={`w-full resize-y pl-7 ${input}`}
        />
      </Marked>
    </div>

    <DayOutline dayId={day.id} blocks={day.schedule_blocks} onError={setError} />
  </div>
    </>
  )
}
