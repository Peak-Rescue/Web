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
  currentNote,
}: {
  token: string
  currentInterested: boolean | null
  currentNote: string | null
}) {
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
    setBusy(interested ? 'yes' : 'no')
    setError(null)
    try {
      const result = await respondToInvite(token, { interested, note })
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

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-xs text-zinc-400 mb-1.5">Note for the ops team (optional)</label>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          placeholder="Availability caveats, travel needs, role preference…"
          className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2.5 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-zinc-500"
        />
      </div>
      {error && <p className="text-sm text-red-400">{error}</p>}
      <div className="flex items-center gap-3 flex-wrap">
        <div
          role="radiogroup"
          aria-label="Are you interested in working this course?"
          className="flex items-center gap-3 flex-wrap"
        >
          {choice(true, "I'm interested", 'border-teal-600 bg-teal-900/40 text-teal-200')}
          {choice(false, "Can't make it", 'border-zinc-500 bg-zinc-800 text-zinc-100')}
        </div>
        {saved && <span className="text-xs text-teal-400">Saved</span>}
      </div>
    </div>
  )
}
