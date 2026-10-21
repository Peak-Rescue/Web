'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { errorFrom, type ActionResult, type ActionRefusal } from '@/lib/action-result'
import { CAPABILITY_META, CAPABILITY_ORDER } from '@/lib/capabilities'
import KindOptions from '@/components/KindOptions'
import PlaceSelect from '@/components/PlaceSelect'
import InfoHint from '@/components/InfoHint'
import type { CurriculumFilingChoices, CurriculumFilingDraft } from './actions'

// Filing a curriculum item typed onto one course into the library.
//
// Asked, never automatic: whether something belongs on the shelves, and as
// what, is a judgement. The form opens on the best guess — the classifier's
// type, the course's place and disciplines — so the common case is one look
// and "File", but the admin is the one who says.
//
// A client island in the server-rendered editor because the actions can say
// no, with a door, and a <form action> would swallow it.

const input = 'w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-xs focus:outline-none focus:border-zinc-500'
const label = 'block text-[11px] text-zinc-500 mb-1'

type Ready = Extract<CurriculumFilingDraft, { draft: unknown }>
type Existing = Extract<CurriculumFilingDraft, { existing: unknown }>

export default function SaveItemToLibrary({
  onOpen,
  onFile,
}: {
  onOpen: () => Promise<CurriculumFilingDraft>
  onFile: (choices?: CurriculumFilingChoices) => Promise<ActionResult>
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [refusal, setRefusal] = useState<ActionRefusal | null>(null)
  const [loaded, setLoaded] = useState<Ready | Existing | null>(null)
  const [form, setForm] = useState<CurriculumFilingChoices | null>(null)

  const close = () => { setLoaded(null); setForm(null); setRefusal(null) }

  async function open() {
    setBusy(true)
    setRefusal(null)
    try {
      const r = await onOpen()
      if ('error' in r) { setRefusal(r); return }
      setLoaded(r)
      if ('draft' in r) setForm({ ...r.draft })
    } catch (err) {
      setRefusal({ error: errorFrom(err, 'That didn’t open') })
    } finally {
      setBusy(false)
    }
  }

  async function file(choices?: CurriculumFilingChoices) {
    setBusy(true)
    setRefusal(null)
    try {
      const r = await onFile(choices)
      if (r?.error) setRefusal(r)
      else { close(); router.refresh() }
    } catch (err) {
      setRefusal({ error: errorFrom(err, 'That didn’t save') })
    } finally {
      setBusy(false)
    }
  }

  const said = refusal && (
    <span className="text-[11px] text-pr-red">
      {refusal.error}
      {refusal.link && <> · <Link href={refusal.link.href} className="underline hover:text-white">{refusal.link.label}</Link></>}
    </span>
  )

  if (!loaded) {
    return (
      <span className="inline-flex items-center gap-1.5">
        <button
          type="button"
          disabled={busy}
          onClick={open}
          title="File in the content library so another course can pull it in"
          className="text-[10px] text-zinc-600 hover:text-zinc-300 transition-colors disabled:opacity-40"
        >
          {busy ? 'Opening…' : 'Save to library'}
        </button>
        {said}
      </span>
    )
  }

  const buttons = (primary: string, onPrimary: () => void) => (
    <div className="flex items-center gap-3 flex-wrap">
      <button
        type="button"
        disabled={busy}
        onClick={onPrimary}
        className="px-3 py-1 bg-pr-red hover:bg-pr-red-dark text-white rounded text-xs font-medium transition-colors disabled:opacity-40"
      >
        {busy ? 'Filing…' : primary}
      </button>
      <button type="button" disabled={busy} onClick={close} className="text-xs text-zinc-500 hover:text-zinc-200 transition-colors">
        Cancel
      </button>
      {said}
    </div>
  )

  // basis-full so it drops below the title line it was opened from, rather
  // than squeezing in beside the pills.
  const shell = 'basis-full mt-2 p-3 bg-zinc-950 border border-zinc-800 rounded'

  if ('existing' in loaded) {
    return (
      <div className={`${shell} space-y-2`}>
        <p className="text-xs text-zinc-300">
          Already in the library as “{loaded.existing.title}”
          {loaded.existing.adminOnly ? ', which is admin-only and cannot sit on a course.' : '.'}
        </p>
        {/* Linking would be refused anyway; saying so before the click is
            kinder than offering a button that cannot work. */}
        {loaded.existing.adminOnly
          ? <button type="button" onClick={close} className="text-xs text-zinc-500 hover:text-zinc-200 transition-colors">Close</button>
          : buttons('Link to it', () => file())}
      </div>
    )
  }

  if (!form) return null
  const set = (patch: Partial<CurriculumFilingChoices>) => setForm({ ...form, ...patch })

  return (
    <div className={`${shell} grid grid-cols-1 sm:grid-cols-2 gap-2.5`}>
      <div className="sm:col-span-2">
        <label className={label}>Title</label>
        <input value={form.title} onChange={(e) => set({ title: e.target.value })} className={input} />
      </div>
      <div>
        <label className={`${label} flex items-center gap-1`}>
          Type
          {loaded.draft.unsure && (
            <InfoHint text="A guess. The title and link were not enough to tell what this is, so check the type before filing." />
          )}
        </label>
        <select value={form.kind} onChange={(e) => set({ kind: e.target.value })} className={input}>
          <KindOptions />
        </select>
      </div>
      <div>
        <label className={label}>Who can see it</label>
        <select
          value={form.audience}
          onChange={(e) => set({ audience: e.target.value as CurriculumFilingChoices['audience'] })}
          className={input}
        >
          <option value="internal">Instructors only</option>
          <option value="shared">Students &amp; instructors</option>
          <option value="admin">Admins only — and never on a course</option>
        </select>
      </div>
      <div className="sm:col-span-2">
        <label className={label}>{form.kind === 'map' ? 'Location *' : 'Location'}</label>
        <PlaceSelect
          name="place"
          venues={loaded.venues}
          sites={loaded.sites}
          value={form.place}
          onChange={(v) => set({ place: v })}
          required={form.kind === 'map'}
          className={input}
        />
      </div>
      <div className="sm:col-span-2">
        <label className={label}>Disciplines</label>
        <div className="flex flex-wrap gap-x-4 gap-y-1.5 p-2 bg-zinc-800/50 border border-zinc-700 rounded">
          {CAPABILITY_ORDER.map((c) => (
            <label key={c} className="flex items-center gap-1.5 text-xs text-zinc-300 cursor-pointer">
              <input
                type="checkbox"
                checked={form.disciplines.includes(c)}
                onChange={(e) =>
                  set({ disciplines: e.target.checked ? [...form.disciplines, c] : form.disciplines.filter((d) => d !== c) })
                }
                className="accent-red-600"
              />
              {CAPABILITY_META[c].label}
            </label>
          ))}
        </div>
      </div>
      <div className="sm:col-span-2">
        <label className={label}>Topic tags (comma separated)</label>
        <input value={form.topics} onChange={(e) => set({ topics: e.target.value })} className={input} placeholder="Rappelling, Anchors" />
      </div>
      <div className="sm:col-span-2">{buttons('File', () => file(form))}</div>
    </div>
  )
}
