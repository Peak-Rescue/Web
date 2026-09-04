'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { templateHref, templateShelfHref, type TemplateShelf } from '@/lib/library'
import NewTabIcon from '@/components/NewTabIcon'

/** A template as a picker needs it: enough to tell two apart without opening
    either — what it's for, how big it is, and what is actually in it. */
export type TemplateChoice = {
  id: string
  name: string
  description?: string | null
  /** Days for a schedule, items for a gear list. */
  count: number
  /** The contents in order, so "what is this actually" is answerable here
      rather than only after copying it onto the course. */
  preview?: string[]
  /** Why it is offered for this course — the offering it belongs to, or the
      disciplines it shares with it. Null means it isn't specific to this
      course, which is what the shelf filter goes on. */
  relevance?: string | null
  /** A second fact worth seeing in the row: who carries a gear list. */
  badge?: string | null
}

// The shelf, browsable rather than dumped.
//
// Both shelves used to arrive as a row of buttons, one per template: fine at
// six, unreadable at sixty, and with no way to see what was in one short of
// copying it onto the course and reading the result. The shelf only grows, so
// the list is searched, cut to what this course is, and each row opens to its
// contents — and every row carries the way back to the template itself, which
// was the thing a course page never said.
export default function TemplatePicker({
  shelf, templates, busy, onUse, title, countNoun, emptyPreview, className,
}: {
  shelf: TemplateShelf
  templates: TemplateChoice[]
  busy: boolean
  onUse: (t: TemplateChoice) => void
  title: string
  /** Singular; pluralised with a bare s. */
  countNoun: string
  emptyPreview: string
  className?: string
}) {
  const [q, setQ] = useState('')
  const [showAll, setShowAll] = useState(false)
  const [openId, setOpenId] = useState<string | null>(null)

  const forThisCourse = useMemo(() => templates.filter((t) => t.relevance), [templates])
  // Tagged-for-this-course is the default view, but only when it would leave
  // anything: a shelf where nothing is tagged yet must not read as empty.
  const scoped = showAll || forThisCourse.length === 0 ? templates : forThisCourse
  const needle = q.trim().toLowerCase()
  const shown = needle
    ? templates.filter((t) =>
        `${t.name} ${t.description ?? ''} ${(t.preview ?? []).join(' ')}`.toLowerCase().includes(needle))
    : scoped
  const hidden = templates.length - shown.length
  const n = (c: number) => `${c} ${countNoun}${c === 1 ? '' : 's'}`

  if (templates.length === 0) {
    return (
      <p className={`text-xs text-zinc-600 ${className ?? ''}`}>
        Nothing saved to the shelf yet.{' '}
        <Link
          href={templateShelfHref(shelf)}
          target="_blank"
          className="text-zinc-400 hover:text-white underline underline-offset-2 inline-flex items-center gap-1"
        >
          The library<NewTabIcon />
        </Link>{' '}
        is where they live once you save one.
      </p>
    )
  }

  return (
    <div className={`rounded-lg border border-zinc-800 bg-zinc-900/50 p-3 space-y-2 ${className ?? ''}`}>
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-zinc-400">{title}</span>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search templates…"
          className="ml-auto w-40 bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs focus:outline-none focus:border-zinc-500"
        />
        {/* A new tab, because you are usually mid-build on this course and a
            trip to the shelf shouldn't cost you the page. */}
        <Link
          href={templateShelfHref(shelf)}
          target="_blank"
          className="text-xs text-zinc-500 hover:text-zinc-200 transition-colors inline-flex items-center gap-1"
        >
          Manage templates<NewTabIcon />
        </Link>
      </div>

      <div className="space-y-1.5">
        {shown.map((t) => (
          <div key={t.id} className="rounded border border-zinc-800 bg-zinc-900">
            <div className="flex items-center gap-2 px-2.5 py-2">
              <button
                onClick={() => setOpenId(openId === t.id ? null : t.id)}
                className="min-w-0 flex-1 text-left group"
              >
                <span className="text-sm text-zinc-200 group-hover:text-white transition-colors">{t.name}</span>
                <span className="text-[11px] text-zinc-600 ml-1.5">{n(t.count)}</span>
                {t.badge && <span className="text-[11px] text-zinc-600 ml-1.5">· {t.badge}</span>}
                {t.relevance && (
                  <span className="text-[10px] px-1.5 py-0.5 ml-1.5 rounded bg-blue-900/40 text-blue-300">
                    {t.relevance}
                  </span>
                )}
                {t.description && <span className="block text-[11px] text-zinc-600 truncate">{t.description}</span>}
              </button>
              <button
                onClick={() => setOpenId(openId === t.id ? null : t.id)}
                className="text-[11px] text-zinc-500 hover:text-zinc-200 transition-colors shrink-0"
              >
                {openId === t.id ? 'Hide' : 'Look'}
              </button>
              <Link
                href={templateHref(shelf, t.id)}
                target="_blank"
                className="text-[11px] text-zinc-500 hover:text-zinc-200 transition-colors shrink-0 inline-flex items-center gap-1"
              >
                Edit<NewTabIcon />
              </Link>
              <button
                onClick={() => onUse(t)}
                disabled={busy}
                className="text-xs px-2.5 py-1 rounded border border-zinc-700 text-zinc-300 hover:text-white hover:border-zinc-500 transition-colors disabled:opacity-40 shrink-0"
              >
                Use
              </button>
            </div>
            {openId === t.id && (
              <div className="px-2.5 pb-2.5 border-t border-zinc-800 pt-2">
                {t.description && <p className="text-[11px] text-zinc-500 mb-1.5">{t.description}</p>}
                {t.preview && t.preview.length > 0 ? (
                  <ol className="text-[12px] text-zinc-400 space-y-0.5 list-decimal pl-4 max-h-64 overflow-y-auto">
                    {t.preview.map((line, i) => <li key={i}>{line || '—'}</li>)}
                  </ol>
                ) : (
                  <p className="text-[11px] text-zinc-600">{emptyPreview}</p>
                )}
              </div>
            )}
          </div>
        ))}
        {shown.length === 0 && <p className="text-xs text-zinc-600">Nothing matches “{q}”.</p>}
      </div>

      {!needle && forThisCourse.length > 0 && templates.length > forThisCourse.length && (
        <button
          onClick={() => setShowAll(!showAll)}
          className="text-[11px] text-zinc-500 hover:text-zinc-200 transition-colors"
        >
          {showAll
            ? 'Only what fits this course'
            : `Show all ${templates.length} templates (${hidden} for other courses)`}
        </button>
      )}
    </div>
  )
}
