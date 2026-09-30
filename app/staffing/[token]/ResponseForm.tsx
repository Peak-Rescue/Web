'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { respondToInvite } from './actions'

// The two answers, as a choice rather than as two actions.
//
// They used to be two buttons that looked the same whichever you had picked —
// one permanently red, which reads as chosen — so the page carried a paragraph
// above them saying which one you had actually chosen, and your answer was on
// screen twice in two different shapes. The banner was doing the buttons' job.
//
// So the buttons hold the state: the one you picked is filled and its dot is
// lit, the other goes quiet, and changing your mind is pressing the quiet one.
// No sentence needed, and nothing to reconcile against anything else.
//
// A dot rather than a tick. A tick is an affirmative glyph, so "✓ Can't make
// it" reads as a yes to a no and has to be unpicked before it can be read. A
// filled radio says only "this one", which is the whole claim — and the empty
// ring on the other one is what makes the pair read as a single choice rather
// than as two buttons that happen to sit together.
//
// On a course that is already crewed the yes button says what it now means:
// backup. The fact is at the top of the page in a colour nothing else uses,
// but the top of the page is not where the decision happens, and the page has
// enough grey sentences without a second copy of that one. Putting it in the
// label costs no reading and cannot be clicked past.
//
// Two buttons and not one segmented control, which this was briefly. Sharing a
// container means the unpicked side has to be flat — no border, no fill — or
// the control stops reading as one object. That is fine once something is
// picked and wrong before anything is, which is the only moment that matters
// here: an invite arrives unanswered, and the first thing the page has to say
// is that these two things can be pressed. Each keeping its own border says
// it. The radiogroup stays either way; that part was never about the shape.
export default function ResponseForm({
  token,
  currentInterested,
  currentAccepts,
  currentNote,
  staffed = false,
  seats = [],
}: {
  token: string
  currentInterested: boolean | null
  /** The seats they have already said they would take. Null is a yes given
      before we started asking which — "seat unstated", not "any seat". */
  currentAccepts: string[] | null
  currentNote: string | null
  /** The crew is already full, so saying yes is volunteering as a backup. */
  staffed?: boolean
  /** The seats this person could hold, each with what it pays. Their ceiling,
      not the course's — a lead seat is not offered to somebody without the
      sign-off, so there is nothing here to tick that they could not be given.
      Empty on a course with no crew plan, and then the yes is a plain yes. */
  seats?: { role: string; label: string; hourly: number | null; open: number }[]
}) {
  // Which seats they would take. The yes used to be a yes to nothing in
  // particular, and staffing then had to guess — which mattered the moment the
  // seat became the wage, because guessing wrong is a pay cut nobody agreed to.
  //
  // Pre-ticked from their last answer, and on a first visit from every seat they
  // could hold: the common case is somebody who will work the week in whatever
  // capacity is needed, and making that person tick three boxes to say so is a
  // tax on the answer we most want. Unticking is how you say "not that one",
  // which is the rarer and more deliberate claim.
  const [accepts, setAccepts] = useState<Set<string>>(
    () => new Set(currentAccepts ?? seats.map((s) => s.role))
  )
  const [note, setNote] = useState(currentNote ?? '')
  const [busy, setBusy] = useState<'yes' | 'no' | null>(null)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  // Pressing the answer you already gave — to save an edited note — moves
  // nothing on screen, so that one case says so and then stops saying it.
  useEffect(() => {
    if (!saved) return
    const t = setTimeout(() => setSaved(false), 2500)
    return () => clearTimeout(t)
  }, [saved])

  async function submit(interested: boolean) {
    if (busy) return
    // A yes to no seat at all is not an answer this page will send. It would
    // arrive at staffing as an empty array, which reads as "any" to anybody
    // glancing and as "none" to the code — and the difference between those two
    // is somebody's wage.
    if (interested && seats.length > 0 && accepts.size === 0) {
      setError('Pick at least one role, or "Can\'t make it".')
      return
    }
    setBusy(interested ? 'yes' : 'no')
    setError(null)
    try {
      const result = await respondToInvite(token, {
        interested,
        note,
        accepts: interested && seats.length > 0 ? [...accepts] : null,
      })
      if (result.ok) {
        setSaved(true)
        router.refresh()
      } else {
        setError(result.error)
      }
    } finally {
      setBusy(null)
    }
  }

  const answered = currentInterested !== null
  const question = staffed
    ? 'Do you want to be considered as a backup for this course?'
    : 'Are you interested in working this course?'

  const choice = (yes: boolean, label: string, picked: string) => {
    const chosen = currentInterested === yes
    const sending = busy === (yes ? 'yes' : 'no')
    return (
      <button
        role="radio"
        onClick={() => submit(yes)}
        disabled={busy !== null}
        aria-checked={chosen}
        className={`inline-flex items-center gap-2 px-6 py-3 rounded font-semibold border transition-colors disabled:opacity-40 ${
          chosen
            ? picked
            : answered
              // Not your answer, once you have one: quiet, and obviously still
              // pressable — this is the whole "change your mind" affordance.
              ? 'border-zinc-800 text-zinc-500 hover:border-zinc-600 hover:text-zinc-300'
              // Nothing answered yet, so neither is a state and both are asks.
              : 'border-zinc-700 bg-zinc-900 text-zinc-200 hover:border-zinc-500'
        }`}
      >
        <span
          aria-hidden
          className={`size-3.5 shrink-0 rounded-full border-2 grid place-items-center ${
            chosen ? 'border-current' : 'border-zinc-600'
          }`}
        >
          {chosen && <span className="size-1.5 rounded-full bg-current" />}
        </span>
        {sending ? 'Sending…' : label}
      </button>
    )
  }

  function toggleSeat(role: string) {
    setAccepts((cur) => {
      const next = new Set(cur)
      if (next.has(role)) next.delete(role)
      else next.add(role)
      return next
    })
    // Their answer is already on file and they have just changed what it means,
    // so it is no longer saved. Saying so beats letting a stale "Saved" sit
    // under a box somebody has just unticked.
    setSaved(false)
  }

  return (
    <div className="space-y-4">
      {seats.length > 0 && (
        <div>
          <label className="block text-xs text-zinc-400 mb-2">
            Which of these would you take?
          </label>
          <div className="space-y-1.5">
            {seats.map((s) => {
              const on = accepts.has(s.role)
              return (
                <label
                  key={s.role}
                  className={`flex items-center gap-3 px-3 py-2 rounded border cursor-pointer transition-colors ${
                    on
                      ? 'border-teal-700 bg-teal-900/20 text-zinc-100'
                      : 'border-zinc-800 bg-zinc-900/60 text-zinc-500 hover:border-zinc-700'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={() => toggleSeat(s.role)}
                    className="accent-teal-500"
                  />
                  <span className="text-sm font-medium flex-1">{s.label}</span>
                  {/* The rate, so a tick is an informed one. Absent for anybody
                      whose course days are not paid on top of anything else —
                      there is no hourly to quote them. */}
                  {s.hourly !== null && (
                    <span className="text-xs text-zinc-400 tabular-nums">${s.hourly}/h</span>
                  )}
                  {s.open === 0 && (
                    <span className="text-[10px] uppercase tracking-wide text-zinc-600">filled for now</span>
                  )}
                </label>
              )
            })}
          </div>
          <p className="mt-2 text-[11px] text-zinc-600 leading-snug">
            We won&apos;t put you in a role you left unticked without asking.
          </p>
        </div>
      )}
      <div>
        <label className="block text-xs text-zinc-400 mb-1.5">Note for the ops team (optional)</label>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          placeholder="Availability caveats, travel needs, anything we should know…"
          className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2.5 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-zinc-500"
        />
      </div>
      {error && <p className="text-sm text-red-400">{error}</p>}
      <div className="flex items-center gap-3 flex-wrap">
        <div
          role="radiogroup"
          aria-label={question}
          className="flex items-center gap-3 flex-wrap"
        >
          {choice(true, staffed ? 'Consider me as backup' : "I'm interested", 'border-teal-600 bg-teal-900/40 text-teal-200')}
          {choice(false, "Can't make it", 'border-zinc-500 bg-zinc-800 text-zinc-100')}
        </div>
        {saved && <span className="text-xs text-teal-400">Saved</span>}
      </div>
    </div>
  )
}
