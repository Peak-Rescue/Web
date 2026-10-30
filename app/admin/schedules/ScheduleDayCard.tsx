'use client'

import { useMemo, useState } from 'react'
import { updateScheduleDay, removeScheduleDay, moveScheduleDay } from './actions'
import DayOutline from './DayOutline'
import { Grows, Marked, PinIcon, RouteIcon, NoteIcon, TargetIcon, PencilIcon } from './fields'
import type { ScheduleDay, SiteOption } from './types'
import { useTrackedSaves, useRegisterSaver } from '@/components/PendingSaves'
import { useDayOrder } from './DayOrder'
import { shelfLink } from '@/lib/library'

// The site picker's value for a place typed rather than picked.
const ELSEWHERE = 'elsewhere'

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
  venueId = null,
  region = null,
  location = null,
  order,
  onRemoving,
  onRemoveFailed,
  onError,
}: {
  day: ScheduleDay
  sites?: SiteOption[]
  venueId?: string | null
  /** The course's state and the location as it was typed. A venue is set on
      five courses in eighty; these are set on nearly all of them, and they
      point at the same answer. */
  region?: string | null
  location?: string | null
  /** Where this day sits in the running order, so the card can offer to move
      it. Required, and `'unordered'` is the deliberate no: these were two
      optional booleans, and a caller that passed neither got a card with no
      reordering on it and no complaint from anywhere — which is how the full
      editor laid days out in order for months with no way to change it. A list
      with no order to speak of now has to say so out loud. */
  order: { isFirst: boolean; isLast: boolean } | 'unordered'
  /** The list, if there is one, takes the day off screen on the click rather
      than on the round trip — and puts it back if the server disagreed. */
  onRemoving?: (id: string) => void
  onRemoveFailed?: (id: string) => void
  onError?: (message: string | null) => void
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function fail(message: string | null) {
    setError(message)
    onError?.(message)
  }

  // Blur fires on the mousedown that closes this card's editor; tracking the
  // save keeps the close from re-reading the page before it lands.
  const track = useTrackedSaves()

  // Inside a DayOrder the arrows move the day on screen at once and the list
  // sends the order when the presses stop; closing the editor waits for that
  // send like any other save. Outside one, a press is a save and a rebuild.
  const live = useDayOrder()
  useRegisterSaver({
    isPending: () => live?.isPending() ?? false,
    flush: () => live?.flush() ?? Promise.resolve(),
  })
  const at = live?.position(day.id) ?? -1
  const ends = live && at >= 0
    ? { isFirst: at === 0, isLast: at === live.count - 1 }
    : order === 'unordered' ? null : order

  function press(direction: 'up' | 'down', button: HTMLButtonElement) {
    if (!live || at < 0) return void run(() => moveScheduleDay(day.id, direction))
    // The card jumps a whole day's height on every press, which took the arrow
    // out from under the pointer — so the page scrolls by the same amount and
    // the next press lands on the same arrow.
    const before = button.getBoundingClientRect().top
    live.move(day.id, direction)
    requestAnimationFrame(() => window.scrollBy(0, button.getBoundingClientRect().top - before))
  }

  // Every action here revalidates the course, and that already carries the
  // re-rendered page back with the action's own response. A router.refresh()
  // after it rendered the whole page a second time, in series — which is most
  // of why picking a canyon took seconds to land.
  async function run(fn: () => Promise<unknown>, _opts?: { quiet?: boolean }) {
    setBusy(true); fail(null)
    try { await track(fn()); return true }
    catch (e) { fail(e instanceof Error ? e.message : 'That didn’t save'); return false }
    finally { setBusy(false) }
  }

  const heading = 'text-[10px] uppercase tracking-wide text-zinc-500'
  const input = 'bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-sm focus:outline-none focus:border-zinc-500'

  // The pick shows on the change, not on the round trip: the select is
  // controlled by the server's row, so without this it snapped back to the old
  // canyon until the page came back.
  const [pickedSite, setPickedSite] = useState<{ id: string | null } | null>(null)
  const siteId = pickedSite ? pickedSite.id : day.site_id
  const site = sites.find((s) => s.id === siteId)
  // "Somewhere else" is open when the day has typed words and no site, or
  // when it was just picked and nothing is typed yet.
  const [elsewhereOpen, setElsewhereOpen] = useState(false)
  const elsewhere = !siteId && (elsewhereOpen || Boolean(day.location?.trim()))

  // The course's own venue first, then everywhere else — the list is one
  // dropdown, so the ordering is the only thing making a Maui course feel like
  // it knows it's on Maui.
  const siteGroups = useMemo(() => {
    // Where this course is, by whatever it actually says. The venue is the
    // exact answer and is set on five courses in eighty; the state and the
    // typed location are set on nearly all of them and point the same way. A
    // list that leads with the right places only for the courses that filled
    // in the rarest field is a list that leads with nothing.
    const loc = (location ?? '').toLowerCase().trim()
    const here = sites.filter((s) => {
      if (venueId) return s.venue_id === venueId
      if (region && s.venue_region === region) return true
      const venue = (s.venue_name ?? '').toLowerCase()
      return Boolean(loc && venue && (loc.includes(venue) || venue.includes(loc)))
    })
    const rest = sites.filter((s) => !here.includes(s))
    const restBy = new Map<string, SiteOption[]>()
    for (const s of rest) {
      const k = s.venue_name ?? 'Elsewhere'
      restBy.set(k, [...(restBy.get(k) ?? []), s])
    }
    // Headed with the venue's name: these are sites, and "This course's
    // venue" over a list of canyons called each of them a venue.
    const hereVenues = new Set(here.map((s) => s.venue_name ?? ''))
    const hereName = hereVenues.size === 1 && [...hereVenues][0] ? [...hereVenues][0] : 'Near this course'
    return [
      ...(here.length ? [{ name: hereName, sites: here }] : []),
      ...[...restBy.entries()].map(([name, sites]) => ({ name, sites })),
    ]
  }, [sites, venueId, region, location])

  return (
    <>
      {error && <p className="text-sm text-pr-red mb-2">{error}</p>}
  <div className="border border-zinc-800 rounded-lg overflow-hidden">
    <div className="bg-zinc-900 px-3 py-2 space-y-2">
      {/* The name of the day is the long thing here and "Remove day" is the
          short one, so on a narrow screen they stop sharing a line: side by
          side, a day called "Day 1 — Refresher, Rigging & Anchors" showed
          about half of itself. */}
      <div className="flex flex-wrap items-center gap-2">
        <input
          // Keyed on the saved title: a "Day 3" default is renumbered by the
          // server when the day moves, and a stale uncontrolled field would
          // write the old number back on its next blur.
          key={day.title}
          defaultValue={day.title}
          onBlur={(e) => e.target.value !== day.title && run(() => updateScheduleDay(day.id, { title: e.target.value }), { quiet: true })}
          placeholder="Day 1: Basic rope skills"
          className={`w-full sm:w-auto sm:flex-1 font-medium ${input}`}
        />
        {/* Order is set from inside the day's editor, not from the header of
            the day you are reading. It used to be a pair of arrows on that
            header, which put a live reordering control under every thumb
            scrolling a schedule on a phone — a mis-tap there silently swapped
            two days of a course. Getting here takes a deliberate press.

            Arrows again, now that they are behind that press: "Move earlier"
            and "Move later" are two words that read alike at a glance, and the
            thing they do is a direction. They keep the press's worth of
            padding the words had rather than shrinking to the glyph, and say
            their names to a screen reader and on hover. */}
        {ends && (
          <span className="ml-auto flex shrink-0 items-center gap-1.5">
            {([
              ['up', 'Move earlier', ends.isFirst, 'M12 19V5', 'm5 12 7-7 7 7'],
              ['down', 'Move later', ends.isLast, 'M12 5v14', 'm19 12-7 7-7-7'],
            ] as const).map(([direction, label, atEnd, stem, head]) => (
              <button
                key={direction}
                type="button"
                disabled={(busy && !live) || atEnd}
                onClick={(e) => press(direction, e.currentTarget)}
                aria-label={label}
                title={label}
                className="rounded border border-zinc-800 px-2 py-1.5 text-zinc-500 hover:text-white hover:border-zinc-600 transition-colors disabled:opacity-30 disabled:hover:text-zinc-500 disabled:hover:border-zinc-800"
              >
                <svg
                  aria-hidden
                  xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24"
                  fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"
                >
                  <path d={stem} />
                  <path d={head} />
                </svg>
              </button>
            ))}
          </span>
        )}
        <button
          onClick={() => {
            if (!confirm(`Remove "${day.title}"?`)) return
            onRemoving?.(day.id)
            void run(() => removeScheduleDay(day.id)).then((ok) => {
              if (!ok) onRemoveFailed?.(day.id)
            })
          }}
          // A word-sized target in the quietest grey on the card, an inch
          // from the title field a thumb is aiming at. Given an edge and a
          // press's worth of padding: still quiet, but now both hittable and
          // missable on purpose.
          className="ml-auto shrink-0 rounded border border-zinc-800 px-2 py-1.5 text-xs text-zinc-500 hover:text-red-400 hover:border-red-900/60 transition-colors [&:not(:first-child)]:ml-0"
        >
          Remove day
        </button>
      </div>
      {/* No meetup picker here any more. It asked the same question as the
          meeting block on the portal day card — and answering it here quietly
          changed what that block read back, a button away, with nothing
          saying so. This card is the day's content: where we are going, the
          beta, the objectives, the topics. Where we gather is the morning's,
          and lives with the hour and the pins and the press that tells the
          course about them. */}
      {/* One question, one control. A typed Location sat beside the site
          picker and the two said the same thing twice — "Knucklehead" next
          to Knucklehead Canyon — so the words are now only for a place that
          is not a site, behind "Somewhere else". */}
      <div className="space-y-2">
        <p className={heading}>Site</p>
        {sites.length > 0 && (
          <Marked icon={<RouteIcon />}>
            <select
              value={siteId ?? (elsewhere ? ELSEWHERE : '')}
              onChange={(e) => {
                const v = e.target.value
                if (v === ELSEWHERE) {
                  setElsewhereOpen(true)
                  if (siteId) {
                    setPickedSite({ id: null })
                    void run(() => updateScheduleDay(day.id, { site_id: null })).then(() => setPickedSite(null))
                  }
                  return
                }
                setElsewhereOpen(false)
                const next = v || null
                setPickedSite({ id: next })
                void run(() => updateScheduleDay(day.id, next ? { site_id: next } : { site_id: null, location: null }))
                  .then(() => setPickedSite(null))
              }}
              className={`w-full pl-7 ${input} ${siteId || elsewhere ? 'text-zinc-200' : 'text-zinc-500'}`}
            >
              <option value="">No site</option>
              {siteGroups.map((g) => (
                <optgroup key={g.name} label={g.name}>
                  {g.sites.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </optgroup>
              ))}
              <option value={ELSEWHERE}>Somewhere else…</option>
            </select>
          </Marked>
        )}
        {(elsewhere || sites.length === 0) && (
          <Marked icon={<PinIcon />}>
            <input
              // Keyed on the saved words so a site picked and un-picked does
              // not leave stale text in an uncontrolled box.
              key={day.location ?? ''}
              autoFocus={elsewhereOpen && !day.location}
              aria-label="Where, if not a site"
              defaultValue={day.location ?? ''}
              onBlur={(e) => e.target.value !== (day.location ?? '') && run(() => updateScheduleDay(day.id, { location: e.target.value }), { quiet: true })}
              className={`w-full pl-7 ${input}`}
            />
          </Marked>
        )}
      </div>
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
                href={`${shelfLink('venue').href}#site-${site.id}`}
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
      {/* A day at a place carries its beta here — approach, rap count,
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
          course objectives are too coarse to teach a Tuesday from. Headed,
          like the schedule below it: unlabelled, this was the biggest empty
          box on the card, and a day's whole running order got pasted into it. */}
      <p className={heading}>Daily objectives</p>
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
          placeholder="One per line"
          className={`w-full resize-y pl-7 ${input}`}
        />
      </Marked>
    </div>

    <p className={`${heading} px-3 pt-2`}>Schedule</p>
    <DayOutline dayId={day.id} blocks={day.schedule_blocks} onError={setError} />
  </div>
    </>
  )
}
