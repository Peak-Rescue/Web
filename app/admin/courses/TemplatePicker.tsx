'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { applyCourseTemplate, previewCourseTemplate } from './actions'

export type TemplateOption = {
  id: string
  name: string
  description: string | null
  sections: number
  items: number
  isDefault: boolean
}

// Sets a course up the way that kind of course is normally run: its usual
// sections, filled with references to the same library material. Re-running it
// is safe and is how a course picks up anything added since.
export default function TemplatePicker({
  instanceId,
  templates,
}: {
  instanceId: string
  templates: TemplateOption[]
}) {
  const router = useRouter()
  const [busy, setBusy] = useState<string | null>(null)
  // Preview before applying — adding 70-odd items sight unseen is a leap.
  const [preview, setPreview] = useState<{
    tpl: TemplateOption
    sections: {
      title: string; audience: 'internal' | 'shared'; sectionExists: boolean
      items: { id: string; title: string; kind: string; audience: string; alreadyOnCourse: boolean }[]
    }[]
  } | null>(null)
  // Items unticked in the preview — they stay out when the setup is applied.
  const [excluded, setExcluded] = useState<Set<string>>(new Set())
  const [msg, setMsg] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  if (templates.length === 0) return null

  function toggle(ids: string[], on: boolean) {
    setExcluded((prev) => {
      const next = new Set(prev)
      for (const id of ids) {
        if (on) next.delete(id)
        else next.add(id)
      }
      return next
    })
  }

  async function open(t: TemplateOption) {
    setBusy(t.id)
    setError(null)
    try {
      setExcluded(new Set())
      setPreview({ tpl: t, sections: await previewCourseTemplate(instanceId, t.id) })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not read that setup.')
    } finally {
      setBusy(null)
    }
  }

  async function apply(t: TemplateOption) {
    setBusy(t.id)
    setError(null)
    try {
      const res = await applyCourseTemplate(instanceId, t.id, Array.from(excluded))
      setMsg(
        res.items === 0 && res.sections === 0
          ? `“${t.name}” is already applied.`
          : `Added ${res.items} item${res.items === 1 ? '' : 's'} across ${res.sections} new section${res.sections === 1 ? '' : 's'}.`
      )
      setPreview(null)
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not apply the template.')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="mb-4 p-3 bg-zinc-900 border border-zinc-800 rounded-lg">
      <p className="text-xs text-zinc-500 mb-2">
        <span className="text-zinc-300 font-medium">Start with a standard setup.</span> Adds the sections and
        material this kind of course normally uses — change anything afterwards.
      </p>
      <div className="flex flex-wrap gap-2">
        {templates.map((t) => (
          <button
            key={t.id}
            onClick={() => open(t)}
            disabled={busy !== null}
            title={`See what ${t.name} would add`}
            className="text-xs px-3 py-1.5 rounded border border-zinc-700 text-zinc-300 hover:text-white hover:border-zinc-500 transition-colors disabled:opacity-40"
          >
            {busy === t.id ? 'Loading…' : t.name}
            <span className="text-zinc-600 ml-1.5">
              {t.sections} section{t.sections === 1 ? '' : 's'} · {t.items}
            </span>
            {t.isDefault && <span className="text-teal-500/80 ml-1.5">suggested</span>}
          </button>
        ))}
      </div>
      {preview && (
        <div className="mt-3 border border-zinc-700 rounded-lg overflow-hidden">
          <div className="px-3 py-2 bg-zinc-950/60 flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium">{preview.tpl.name}</span>
            <span className="text-[11px] text-zinc-500">
              {preview.sections.reduce((n, s) => n + s.items.filter((i) => !i.alreadyOnCourse && !excluded.has(i.id)).length, 0)} item(s)
              will be added — untick anything you don&apos;t want
            </span>
          </div>
          <div className="max-h-72 overflow-y-auto divide-y divide-zinc-800/60">
            {preview.sections.map((sec) => {
              const addable = sec.items.filter((i) => !i.alreadyOnCourse)
              const picked = addable.filter((i) => !excluded.has(i.id))
              return (
                <details key={sec.title} className="px-3 py-2">
                  <summary className="cursor-pointer list-none flex items-center gap-2 text-sm">
                    <span className="text-zinc-600 text-[10px]">▶</span>
                    {addable.length > 0 && (
                      <input
                        type="checkbox"
                        checked={picked.length === addable.length}
                        ref={(el) => {
                          if (el) el.indeterminate = picked.length > 0 && picked.length < addable.length
                        }}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => toggle(addable.map((i) => i.id), e.target.checked)}
                        title="Include this whole section"
                        className="accent-teal-600"
                      />
                    )}
                    {sec.title}
                    <span className="text-[10px] text-zinc-600">{sec.items.length}</span>
                    {sec.audience === 'internal' && (
                      <span className="text-[10px] px-1 rounded bg-zinc-800 text-zinc-400">Internal</span>
                    )}
                    {sec.sectionExists && <span className="text-[10px] text-zinc-600">section already here</span>}
                  </summary>
                  <ul className="mt-1 pl-4 space-y-0.5">
                    {sec.items.map((i) => (
                      <li
                        key={i.id}
                        className={`text-[11px] ${
                          i.alreadyOnCourse ? 'text-zinc-700 line-through' : excluded.has(i.id) ? 'text-zinc-700' : 'text-zinc-500'
                        }`}
                      >
                        {i.alreadyOnCourse ? (
                          <>
                            {i.title}
                            {i.audience === 'internal' && <span className="text-zinc-700"> · internal</span>}
                          </>
                        ) : (
                          <label className="flex items-center gap-1.5 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={!excluded.has(i.id)}
                              onChange={(e) => toggle([i.id], e.target.checked)}
                              className="accent-teal-600"
                            />
                            <span>
                              {i.title}
                              {i.audience === 'internal' && <span className="text-zinc-700"> · internal</span>}
                            </span>
                          </label>
                        )}
                      </li>
                    ))}
                    {sec.items.length === 0 && <li className="text-[11px] text-zinc-700">nothing in this section yet</li>}
                  </ul>
                </details>
              )
            })}
          </div>
          <div className="px-3 py-2 bg-zinc-950/60 flex items-center gap-3">
            <button
              onClick={() => apply(preview.tpl)}
              disabled={busy !== null}
              className="text-xs px-3 py-1.5 rounded bg-pr-red hover:bg-pr-red-dark text-white font-medium transition-colors disabled:opacity-40"
            >
              {busy ? 'Adding…' : 'Add these'}
            </button>
            <button onClick={() => setPreview(null)} className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors">
              Cancel
            </button>
          </div>
        </div>
      )}

      {msg && <p className="text-xs text-teal-400 mt-2">{msg}</p>}
      {error && <p className="text-xs text-pr-red mt-2">{error}</p>}
    </div>
  )
}
