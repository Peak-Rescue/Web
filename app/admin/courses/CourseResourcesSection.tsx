'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { errorFrom, type ActionResult } from '@/lib/action-result'
import AddLinkDialog from '@/components/AddLinkDialog'
import { createClient } from '@/lib/supabase/client'
import AddButtons from '@/components/AddButtons'
import { KIND_META, shelfLink, type LibraryAudience, type LibraryKind } from '@/lib/library'
import { AudiencePills } from '@/components/AudiencePills'
import AudienceToggle from '@/components/AudienceToggle'
import {
  addCourseResourceLink,
  addCourseResourcesFromLibrary,
  createResourceUploadTargets,
  finalizeResourceUploads,
  loadResourceLibrary,
  removeCourseResource,
  saveCourseResourceToLibrary,
  setCourseResourceAudience,
  type ResourcePickerItem,
} from './resource-actions'
import TrashIcon from '@/components/TrashIcon'

export type CourseResource = {
  id: string
  label: string
  url: string | null
  audience: LibraryAudience
  fromLibrary: boolean
  /** The library item's type, where it came from one. */
  kind?: string | null
  /** The place the library row is filed under, when it is filed under one.
      Venue material on a course reads in the Venue section; this is how the
      two tell each other's rows apart. */
  place?: string | null
  libraryLocked: boolean // library item is instructors-only — can't be shared here
}

// Reference for the course, sat with the location it belongs to — the same
// place maps are chosen, because a med plan is answering the same question a
// map is: what is true about *this* place. Each row carries its own audience;
// the med plan goes to students, the annex behind it usually doesn't.
//
// Called Reference, like the shelf it is drawn from. It was Resources here
// and Reference there, which read as two different piles — and "resources"
// says nothing anyway: everything in the library is a resource. The table is
// still course_resources; renaming that buys nothing and costs a migration.
export default function CourseResourcesSection({
  scope = 'reference',
  instanceId,
  resources,
  placeLabel,
}: {
  /** Which of the course's two sections this is. Venue offers what the
      library has filed under a place — the med plan, the evac plan, the
      permit — and Reference offers the rest of the shelf. One component,
      because adding a library row to a course is one job however the row is
      filed; two scopes, because the two sections are answering different
      questions and should not offer each other's rows. */
  scope?: 'venue' | 'reference'
  instanceId: string
  resources: CourseResource[]
  // Venue name, or the region when there is no venue — what the library would
  // file a document under. Null when the course has neither set yet.
  placeLabel: string | null
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Where to go about it, when the refusal knows.
  const [errorLink, setErrorLink] = useState<{ href: string; label: string } | null>(null)
  const [linkOpen, setLinkOpen] = useState(false)
  // What an upload is filed as. The MEDEVAC banner knows and says so; the
  // plain Upload button asks nothing and lets the row be typed afterwards,
  // which is the same deal the rest of the library offers.
  const [uploadKind, setUploadKind] = useState<string | undefined>(undefined)
  // What the dialog opens asking for. The MEDEVAC banner knows; the plain
  // "+ Add a link" does not and leaves it to be said on the form.
  const [linkKind, setLinkKind] = useState<string | undefined>(undefined)
  const [picker, setPicker] = useState<ResourcePickerItem[] | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [showAll, setShowAll] = useState(false)
  const [q, setQ] = useState('')
  // Narrowed to one type rather than to a guessed word. "Find one" used to
  // put "med plan" in the search box, which matches nothing on a file called
  // Maui-Canyoning-Medical-MEDEVAC-Plan — the thing it was opened to find.
  const [onlyKind, setOnlyKind] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  // Rows that are already written but not yet on the page the server sends.
  // Adding one costs a full rebuild of the course page — about a second — and
  // for that second the section looked exactly as it had before the click,
  // which reads as the add having failed. It is the one thing a write must
  // never look like.
  const [justAdded, setJustAdded] = useState<CourseResource[]>([])

  // Dropped as soon as the server's own copy arrives, so the row does not
  // appear twice. Matched on the title rather than the id: the id a pending
  // row carries is invented here and the one the server gives it is the
  // course_resources row's, so the two could never meet.
  const serverLabels = new Set(resources.map((r) => r.label))
  const pending = justAdded.filter((r) => !serverLabels.has(r.label))
  const shown = [...resources, ...pending]

  // An expected refusal comes back as a value and is shown as it was written;
  // anything thrown is a fault, and errorFrom keeps its digest so the log entry
  // can be found.
  //
  // The refresh happens on a refusal too. Half of them are partial — the link
  // was added and only the promotion to the library was declined — and a
  // refusal that leaves the screen out of date is a worse lie than the wasted
  // fetch when nothing changed.
  async function run(fn: () => Promise<ActionResult>) {
    setBusy(true)
    setError(null)
    setErrorLink(null)
    try {
      const result = await fn()
      router.refresh()
      if (result?.error) {
        setError(result.error)
        setErrorLink(result.link ?? null)
      }
    } catch (e) {
      setError(errorFrom(e))
    } finally {
      setBusy(false)
    }
  }

  async function openPicker() {
    setPickerOpen(true)
    if (picker === null) {
      setBusy(true)
      try {
        setPicker(await loadResourceLibrary(instanceId))
      } catch (e) {
        setError(errorFrom(e, 'Could not load the reference library.'))
      } finally {
        setBusy(false)
      }
    }
  }

  const btn =
    'text-xs px-2.5 py-1.5 rounded border border-zinc-700 text-zinc-300 hover:text-white hover:border-zinc-500 transition-colors disabled:opacity-40'

  const unadded = (picker ?? [])
    .filter((i) => !i.alreadyAdded)
    .filter((i) => (scope === 'venue' ? i.placed : !i.placed))
    .sort((a, b) => Number(b.suggested) - Number(a.suggested) || a.title.localeCompare(b.title))
  // What fits this course — its venue, its region, or its disciplines — is what
  // the picker opens on. The rest of the shelf is one press away and says how
  // much of it there is, so nothing is hidden, only stood back from.
  const fitting = unadded.filter((i) => i.suggested)
  // Typing searches the whole shelf, not the shortlist. Looking for last
  // year's Maui med plan by name and being answered only out of the eleven
  // things that already fit this course is the search failing at the one job
  // it was opened for.
  const needle = q.trim().toLowerCase()
  // 'medevac' is the block, not a type: it is both of them.
  const byKind = onlyKind ? unadded.filter((i) => i.kind === onlyKind) : unadded
  // Narrowing to a type is never the whole question — "a med plan" is always
  // "the med plan for where we are going". When this course's place has one,
  // it is the answer and the rest are a fallback behind it.
  const kindHere = onlyKind ? byKind.filter((i) => i.suggested) : []
  const available = needle
    ? byKind.filter((i) => i.title.toLowerCase().includes(needle))
    : onlyKind
      ? (kindHere.length && !showAll ? kindHere : byKind)
      : showAll || fitting.length === 0
        ? unadded
        : fitting
  const offCourse = unadded.length - fitting.length
  // Every course has a med plan, so the slot for it is always drawn — empty
  // if nobody has put one there. A missing thing that is not on the page is
  // a thing nobody notices is missing, and this one is noticed at the worst
  // possible moment.
  // A file, onto the course and onto the shelf at the same time. Pasting a
  // Drive link was the only way before, which is a second home for a document
  // and no row in the library at all.
  async function upload(files: FileList, kind?: string) {
    const picked = Array.from(files)
    if (picked.length === 0) return
    await run(async () => {
      const prepared = await createResourceUploadTargets(
        instanceId,
        picked.map((f) => ({ name: f.name, size: f.size }))
      )
      if ('error' in prepared) return prepared
      const supabase = createClient()
      const uploads: { path: string; filename: string }[] = []
      for (let i = 0; i < picked.length; i++) {
        const { error: upErr } = await supabase.storage
          .from('task-documents')
          .uploadToSignedUrl(prepared.targets[i].path, prepared.targets[i].token, picked[i], {
            contentType: picked[i].type,
          })
        if (upErr) throw new Error(`Upload failed for “${picked[i].name}”: ${upErr.message}`)
        uploads.push({ path: prepared.targets[i].path, filename: picked[i].name })
      }
      return finalizeResourceUploads(instanceId, uploads, kind ?? uploadKind ?? 'reference', 'internal')
    })
    setUploadKind(undefined)
  }

  // Asked for in the Venue section, because that is where a MEDEVAC plan is.
  // Either type satisfies it: the two are often one document — the Maui one
  // is called Medical-MEDEVAC-Plan — and a course with an evac plan and no
  // separate med plan is not a course missing one.
  const medPlan = scope === 'venue' ? shown.find((r) => r.kind === 'medevac') : true

  return (
    <div className="p-6 pt-5 border-t border-zinc-800">
      {/* No heading. The panel this opens in is already called Reference,
          and saying it twice on one screen reads as two sections. */}

      {!medPlan && (
        <div className="mb-3 flex items-center gap-3 rounded-lg border border-dashed border-amber-900/60 bg-amber-950/10 px-4 py-3">
          <span className="text-sm text-amber-300/90">No MEDEVAC plan on this course</span>
          <span className="text-xs text-zinc-500 min-w-0 flex-1 truncate">
            {placeLabel
              ? `Add ${placeLabel}’s, or any other — it is below with the rest of the shelf.`
              : 'Add one below. Setting where the course is will offer the one for that place.'}
          </span>
          {/* The same three buttons as the block below it, in the same
              style: this banner had its own pair, which is how two rows of
              the same page came to offer the same acts in different clothes. */}
          <AddButtons
            className="shrink-0"
            disabled={busy}
            onFromLibrary={() => { setQ(''); setOnlyKind('medevac'); openPicker() }}
            onAddLink={() => { setLinkKind('medevac'); setLinkOpen(true) }}
            onAddFile={(files) => upload(files, 'medevac')}
          />
        </div>
      )}

      <div className="bg-zinc-950/40 border border-zinc-800 rounded-lg divide-y divide-zinc-800">
        {shown.length === 0 && (
          <p className="text-xs text-zinc-600 px-4 py-4">
            {scope === 'venue' ? 'Nothing from this place yet.' : 'No reference material yet.'}
          </p>
        )}

        {shown.map((r) => (
          <div key={r.id} className="flex items-center gap-3 px-4 py-3">
            <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-zinc-500">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M16 13H8M16 17H8" />
            </svg>

            <div className="min-w-0 flex-1">
              {r.url ? (
                <a href={r.url} target="_blank" rel="noreferrer" className="text-sm text-zinc-200 hover:text-white truncate block">
                  {r.label}
                </a>
              ) : (
                <span className="text-sm text-zinc-200 truncate block">{r.label}</span>
              )}
              {r.fromLibrary ? (
                <Link
                  href={shelfLink(scope === 'venue' ? 'venue' : 'resource', { status: 'all' }).href}
                  className={`text-[11px] transition-colors ${
                    r.libraryLocked
                      ? 'text-amber-600/80 hover:text-amber-400'
                      : 'text-zinc-600 hover:text-zinc-300'
                  }`}
                >
                  {/* A greyed-out toggle with only a tooltip is a dead end. Say
                      what is blocking it, on a link to where it is changed. */}
                  {r.libraryLocked
                    ? 'Instructors-only in the library — change it there to share it'
                    : 'From the library'}
                </Link>
              ) : (
                <span className="text-[11px] text-zinc-600">Link added for this course</span>
              )}
            </div>

            <span title={r.libraryLocked ? 'Marked instructors-only in the library — change it there first.' : undefined}>
              <AudienceToggle
                audience={r.audience}
                disabled={busy || r.libraryLocked}
                noun="this document"
                onChange={(next) => run(() => setCourseResourceAudience(instanceId, r.id, next))}
              />
            </span>

            {!r.fromLibrary && (
              <button
                onClick={() => run(() => saveCourseResourceToLibrary(instanceId, r.id))}
                disabled={busy}
                title="Save to the reference library so the next course here finds it"
                aria-label="Save to the reference library"
                className="shrink-0 text-zinc-600 hover:text-zinc-200 transition-colors disabled:opacity-40"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
                </svg>
              </button>
            )}

            <button
              onClick={() => run(() => removeCourseResource(instanceId, r.id))}
              disabled={busy}
              title="Remove from this course"
              aria-label="Remove from this course"
              className="shrink-0 text-zinc-600 hover:text-pr-red-light transition-colors text-sm leading-none disabled:opacity-40"
            >
              <TrashIcon />
            </button>
          </div>
        ))}
      </div>

      {error && (
        <p className="text-xs text-pr-red mt-2">
          {error}
          {errorLink && (
            <>
              {' '}
              <Link href={errorLink.href} target="_blank" className="underline hover:text-pr-red-light">
                {errorLink.label}
              </Link>
            </>
          )}
        </p>
      )}

      <div className="flex items-center gap-2 mt-3">
        <AddButtons
          disabled={busy}
          noun="file"
          onFromLibrary={openPicker}
          onAddLink={() => { setLinkKind(undefined); setLinkOpen(true) }}
          onAddFile={(files) => upload(files)}
        />
        {/* The shelf this section is a view of. It said Reference on both,
            so the venue half — maps, beta, plans, permits, all filed by
            place — offered a door to a shelf none of its rows are on. */}
        <Link
          href={shelfLink(scope === 'venue' ? 'venue' : 'resource', { status: 'all' }).href}
          target="_blank"
          className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors ml-auto"
        >
          {shelfLink(scope === 'venue' ? 'venue' : 'resource').label} ↗
        </Link>
      </div>

      {pickerOpen && (
        <div className="mt-3 p-3 bg-zinc-950/60 border border-zinc-700 rounded-lg">
          {/* Three hundred rows behind a scrollbar is a list you read, and
              nobody reads one. You come here knowing what you want — last
              year's Maui med plan — and the only thing that finds it by name
              is a box to type the name in. */}
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search the shelf by title…"
            className="w-full mb-2 bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-sm focus:outline-none focus:border-zinc-500"
          />
          {onlyKind && (
            <p className="text-[11px] text-zinc-500 mb-2">
              {kindHere.length && !showAll
                ? `MEDEVAC plans for ${placeLabel || 'where this course is'}.`
                : 'MEDEVAC plans, everywhere.'}{' '}
              {kindHere.length > 0 && byKind.length > kindHere.length && (
                <button
                  onClick={() => setShowAll((v) => !v)}
                  className="underline hover:text-zinc-300 transition-colors"
                >
                  {showAll ? 'Just this place' : `All ${byKind.length}`}
                </button>
              )}{' '}
              <button onClick={() => { setOnlyKind(null); setShowAll(false) }} className="underline hover:text-zinc-300 transition-colors">
                Show everything
              </button>
            </p>
          )}
          <div className="max-h-64 overflow-y-auto divide-y divide-zinc-800/60 border border-zinc-800 rounded">
            {available.map((i) => (
              <label key={i.id} className="flex items-start gap-2.5 px-2.5 py-2 text-sm cursor-pointer hover:bg-zinc-800/50">
                <input
                  type="checkbox"
                  checked={selected.has(i.id)}
                  onChange={() =>
                    setSelected((prev) => {
                      const next = new Set(prev)
                      if (next.has(i.id)) next.delete(i.id)
                      else next.add(i.id)
                      return next
                    })
                  }
                  className="accent-red-600 mt-1 shrink-0"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="truncate">{i.title}</span>
                    <span className="text-[10px] px-1 rounded bg-zinc-800 text-zinc-400 shrink-0">
                      {KIND_META[i.kind as LibraryKind] ?? i.kind}
                    </span>
                    {i.venueName && (
                      <span className="text-[10px] px-1 rounded bg-blue-900/40 text-blue-300 shrink-0">{i.venueName}</span>
                    )}
                    {i.matchedOn === 'client' && (
                      <span className="text-[10px] px-1 rounded bg-zinc-800 text-zinc-400 shrink-0">this client</span>
                    )}
                    {i.matchedOn === 'offering' && (
                      <span className="text-[10px] px-1 rounded bg-zinc-800 text-zinc-400 shrink-0">this course</span>
                    )}
                    {i.matchedOn === 'venue' && (
                      <span className="text-[10px] px-1 rounded bg-zinc-800 text-zinc-400 shrink-0">this venue</span>
                    )}
                    {i.matchedOn === 'region' && i.regionLabel && (
                      <span className="text-[10px] px-1 rounded bg-zinc-800 text-zinc-400 shrink-0">{i.regionLabel}</span>
                    )}
                    {i.matchedOn === 'discipline' && i.disciplineLabel && (
                      <span className="text-[10px] px-1 rounded bg-zinc-800 text-zinc-400 shrink-0">{i.disciplineLabel}</span>
                    )}
                    {i.audience === 'internal' && <AudiencePills audience="internal" className="shrink-0" />}
                  </div>
                </div>
                {i.url && (
                  <a
                    href={i.url}
                    target="_blank"
                    rel="noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    title="Open before adding"
                    className="shrink-0 text-zinc-600 hover:text-zinc-300 transition-colors mt-0.5"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14 21 3" />
                    </svg>
                  </a>
                )}
              </label>
            ))}
            {picker !== null && available.length === 0 && (
              <p className="text-xs text-zinc-500 px-2.5 py-4">
                Nothing on the reference shelf yet — add a link below and tick &ldquo;Add to
                library&rdquo; to put the first one there.
              </p>
            )}
            {picker === null && <p className="text-xs text-zinc-500 px-2.5 py-4">Loading resources…</p>}
            {picker !== null && needle && available.length === 0 && (
              <p className="text-xs text-zinc-500 px-2.5 py-4">
                Nothing on the shelf is called that.
              </p>
            )}
          </div>

          {offCourse > 0 && fitting.length > 0 && !needle && (
            <button
              onClick={() => setShowAll(!showAll)}
              className="mt-2 text-[11px] text-zinc-500 hover:text-zinc-200 transition-colors"
            >
              {showAll
                ? `Only what fits this course`
                : `Show all ${unadded.length} (${offCourse} for other courses)`}
            </button>
          )}

          <div className="flex items-center gap-3 mt-3">
            <button
              onClick={() =>
                run(async () => {
                  const ids = [...selected]
                  // On screen before the round trip, from what the picker
                  // already knows about each row.
                  const chosen = (picker ?? []).filter((i) => ids.includes(i.id))
                  setJustAdded((prev) => [
                    ...prev,
                    ...chosen.map((i) => ({
                      id: `pending:${i.id}`,
                      label: i.title,
                      url: i.url,
                      audience: i.audience,
                      fromLibrary: true,
                      kind: i.kind,
                      libraryLocked: i.audience === 'internal',
                    })),
                  ])
                  setSelected(new Set())
                  setPickerOpen(false)
                  setPicker(null)
                  await addCourseResourcesFromLibrary(instanceId, ids)
                })
              }
              disabled={busy || selected.size === 0}
              className="px-3 py-1.5 rounded bg-pr-red hover:bg-pr-red-dark text-white text-sm font-medium transition-colors disabled:opacity-40"
            >
              {busy ? 'Adding…' : selected.size ? `Add ${selected.size}` : 'Add'}
            </button>
            <button
              onClick={() => { setPickerOpen(false); setSelected(new Set()) }}
              className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <AddLinkDialog
        open={linkOpen}
        busy={busy}
        withAudience
        libraryPlace={placeLabel}
        defaultKind={linkKind}
        defaultToLibrary={Boolean(linkKind)}
        onUpload={(files, kind) => {
          setUploadKind(kind)
          setLinkOpen(false)
          upload(files, kind)
        }}
        onCancel={() => setLinkOpen(false)}
        onSubmit={(name, url, audience, toLibrary, kind, filing) =>
          run(async () => {
            // Close either way: a refusal ("already in the library") is
            // reported under the section, and a dialog left open would sit
            // on top of the sentence explaining what to do instead.
            try {
              const result = await addCourseResourceLink(instanceId, url, name, audience, toLibrary, kind, filing && {
                kind: filing.kind,
                audience: filing.audience as 'internal' | 'shared' | 'admin',
                place: filing.place,
                disciplines: filing.disciplines,
                topics: filing.topicsRaw,
                note: filing.note,
                clientId: filing.client_id,
                courseTypes: filing.course_types,
              })
              if (result?.error) return result
              if (toLibrary) setPicker(null) // the shelf just changed
            } finally {
              setLinkOpen(false)
            }
          })
        }
      />
    </div>
  )
}
