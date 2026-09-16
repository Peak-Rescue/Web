import { CAPABILITY_META } from '@/lib/capabilities'
import { courseCapabilityCategories } from '@/lib/capabilities'
import { courseShortName } from '@/lib/courses'
import type { CourseSetup } from './CourseSetupRow'

// A course setup on its shelf, for someone who can't change it — the same
// bargain TemplateReadOnly makes for the other two shelves. What a standard
// canyon course starts with is worth knowing to an instructor; the tags on it
// are admin's to set, so none of the form comes along.
//
// A <details>, not a client component: opening a row is the browser's job.
export default function CourseSetupReadOnly({ setup }: { setup: CourseSetup }) {
  const offering = setup.course_type ? courseShortName(setup.course_type, null) : null
  const tags = [...new Set([
    ...courseCapabilityCategories(setup.course_type ?? '', null) as string[],
    ...setup.disciplines,
  ])].map((d) => CAPABILITY_META[d as keyof typeof CAPABILITY_META]?.label ?? d)
  const itemCount = setup.sections.reduce((n, s) => n + s.items.length, 0)

  return (
    <details className="group rounded-lg border border-zinc-800 bg-zinc-900/60 open:bg-zinc-900">
      <summary className="cursor-pointer list-none px-4 py-3 flex items-center gap-3">
        <span aria-hidden className="text-zinc-600 text-xs transition-transform group-open:rotate-90">▶</span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium truncate">{setup.name}</span>
            {offering && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-900/40 text-blue-300">{offering}</span>
            )}
            <span className="text-[11px] text-zinc-600">
              {setup.sections.length} section{setup.sections.length === 1 ? '' : 's'} · {itemCount} item{itemCount === 1 ? '' : 's'}
            </span>
          </span>
          <span className="block text-[11px] text-zinc-600 mt-1 truncate">
            {setup.description || 'no note'}
            {tags.length > 0 && ` · ${tags.join(', ')}`}
          </span>
        </span>
      </summary>

      <div className="px-4 pb-4 pt-1 space-y-2">
        {setup.sections.map((s, i) => (
          <div key={i}>
            <p className="text-sm text-zinc-300">
              {s.title} <span className="text-[10px] text-zinc-600">{s.items.length}</span>
            </p>
            <ul className="mt-0.5 pl-4 space-y-0.5">
              {s.items.map((t, j) => <li key={j} className="text-[11px] text-zinc-500">{t}</li>)}
            </ul>
          </div>
        ))}
        {setup.sections.length === 0 && (
          <p className="text-[11px] text-zinc-600">This setup has no sections yet.</p>
        )}
      </div>
    </details>
  )
}
