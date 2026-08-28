import Link from 'next/link'
import { addModule, deleteModule, addItem, deleteItem, setModuleAudience, setItemAudience } from './actions'
import { LIBRARY_HREF } from '@/lib/course-links'
import { moduleAudience, type LibraryAudience } from '@/lib/library'
import LibraryPicker from './LibraryPicker'
import SuggestedContent from './SuggestedContent'
import TemplatePicker, { type TemplateOption } from './TemplatePicker'
import RemovableRow from './RemovableRow'
import AudienceSetter from './AudienceSetter'

const ITEM_ICON: Record<string, string> = {
  video: 'M15 10l4.553-2.069A1 1 0 0 1 21 8.82v6.361a1 1 0 0 1-1.447.894L15 14M3 8a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8z',
  doc:   'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M16 13H8M16 17H8M10 9H8',
  link:  'M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71',
}

type LibItem = { id: string; title: string; url: string | null; kind: string; audience: LibraryAudience }

export type CurriculumModule = {
  id: string
  title: string
  audience: string
  course_items?: {
    id: string; title: string; type: string | null; url: string | null
    description: string | null; order: number; audience: string | null
    library_item_id?: string | null
    library_items?: unknown
  }[]
}

// Assigning curriculum to a course — sections, the items in them, and who each
// is for.
//
// A server component rather than a client one, because the whole thing is
// server actions bound to rows: `deleteModule.bind(...)`, and inline
// `'use server'` closures handed to the audience controls. Those cannot be
// created inside a client component, so this stays on the server and is
// rendered by both the admin course editor and the course page itself.
export default function CourseCurriculumEditor({
  instanceId,
  modules,
  templates,
  courseDisciplines,
  knownSectionNames,
}: {
  instanceId: string
  /** Already ordered by the caller — instructor-only sections first for staff. */
  modules: CurriculumModule[]
  templates: TemplateOption[]
  /** Which capability categories this offering covers, for the pickers. */
  courseDisciplines: string[]
  /** Section names already in use, so the same one isn't retyped three
      slightly different ways across courses. */
  knownSectionNames: string[]
}) {
  const addModuleWithId = addModule.bind(null, instanceId)

  return (
    <div>
            <TemplatePicker instanceId={instanceId} templates={templates} />

      <SuggestedContent
        instanceId={instanceId}
        courseDisciplines={courseDisciplines}
        existingItemIds={(modules ?? []).flatMap(m =>
          (m.course_items ?? []).map(ci => ci.library_item_id).filter((x): x is string => Boolean(x))
        )}
      />

      <div className="space-y-6 mb-6">
        {modules.map(mod => {
          const items = (mod.course_items ?? []).slice().sort((a, b) => a.order - b.order)
          const deleteModWithArgs = deleteModule.bind(null, instanceId, mod.id)
          const addItemWithArgs = addItem.bind(null, instanceId, mod.id)

          return (
            <div key={mod.id} className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{mod.title}</span>
                  <AudienceSetter
                    audience={moduleAudience(mod.audience)}
                    noun="this section"
                    action={async (next) => { 'use server'; await setModuleAudience(instanceId, mod.id, next) }}
                  />
                </div>
                <form action={deleteModWithArgs}>
                  <button type="submit" className="text-xs text-zinc-600 hover:text-red-400 transition-colors">Delete section</button>
                </form>
              </div>

              {items.map(item => {
                // Library-backed rows take their title/link from the library
                // entry, so an edit there reaches every course at once.
                // Supabase types the embedded row as an array; it's a
                // single FK join, so take the first (or null).
                const libRaw = item.library_items as unknown
                const lib: LibItem | null = Array.isArray(libRaw) ? (libRaw[0] ?? null) : (libRaw as LibItem | null)
                const title = lib?.title ?? item.title
                const url = lib?.url ?? item.url
                const effective = (item.audience ?? lib?.audience ?? 'shared') as LibraryAudience
                return (
                  <div key={item.id} className="flex items-start justify-between px-4 py-3 border-b border-zinc-800/60 last:border-0">
                    <div className="flex items-start gap-3 min-w-0">
                      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 shrink-0 text-zinc-500">
                        <path d={ITEM_ICON[(item.type ?? 'link') as keyof typeof ITEM_ICON]} />
                      </svg>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          {url
                            ? <a href={url} target="_blank" rel="noreferrer" className="text-sm font-medium hover:text-pr-red-light transition-colors">{title}</a>
                            : <span className="text-sm font-medium">{title}</span>}
                          {lib && <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-500">library</span>}
                          {/* Inside an instructors-only section there is
                              nothing to decide — students see none of it
                              either way, so the control would be a lie.
                              The instructors pill is dropped because the
                              section header two lines up already says it. */}
                          {moduleAudience(mod.audience) === 'shared' && (
                            <AudienceSetter
                              audience={effective}
                              noun="this item"
                              showInstructors={false}
                              action={async (next) => { 'use server'; await setItemAudience(instanceId, item.id, next) }}
                            />
                          )}
                        </div>
                        {item.description && <p className="text-xs text-zinc-500 mt-0.5">{item.description}</p>}
                      </div>
                    </div>
                    <RemovableRow
                      onRemove={async () => { 'use server'; await deleteItem(instanceId, item.id) }}
                      label="×"
                      className="ml-4 shrink-0"
                    />
                  </div>
                )
              })}

              <div className="px-4 py-3 bg-zinc-950/50 border-t border-zinc-800/60">
                <LibraryPicker
                  instanceId={instanceId}
                  moduleId={mod.id}
                  moduleAudience={moduleAudience(mod.audience)}
                  courseDisciplines={courseDisciplines}
                />
              </div>

              <form action={addItemWithArgs} className="flex flex-col sm:flex-row gap-2 px-4 py-3 bg-zinc-950/50">
                <input name="title" required placeholder="Item title" className="flex-1 bg-zinc-800 border border-zinc-700 rounded px-3 py-1.5 text-sm focus:outline-none focus:border-zinc-500" />
                <select name="type" className="bg-zinc-800 border border-zinc-700 rounded px-3 py-1.5 text-sm focus:outline-none focus:border-zinc-500">
                  <option value="doc">Doc</option>
                  <option value="video">Video</option>
                  <option value="link">Link</option>
                </select>
                <input name="url" required placeholder="https://…" className="flex-[2] bg-zinc-800 border border-zinc-700 rounded px-3 py-1.5 text-sm focus:outline-none focus:border-zinc-500" />
                <input name="description" placeholder="Description (optional)" className="flex-[2] bg-zinc-800 border border-zinc-700 rounded px-3 py-1.5 text-sm focus:outline-none focus:border-zinc-500" />
                <button type="submit" className="px-3 py-1.5 bg-pr-red hover:bg-pr-red-dark text-white rounded text-sm font-medium transition-colors whitespace-nowrap">Add</button>
              </form>
            </div>
          )
        })}
      </div>

      {modules.length === 0 && (
        <p className="text-sm text-zinc-500 mb-3">
          Add a section below, then pull items into it from the{' '}
          <Link href={LIBRARY_HREF} className="underline hover:text-zinc-300">content library</Link>.
        </p>
      )}

      <form action={addModuleWithId} className="flex gap-2 flex-wrap items-end p-4 bg-zinc-900 border border-dashed border-zinc-700 rounded-lg">
        <div>
          <label className="block text-xs text-zinc-500 mb-1">New section title</label>
          <input
            name="title"
            required
            list="section-name-suggestions"
            autoComplete="off"
            placeholder="e.g. Anchor Station Rigging"
            className="bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-zinc-500 w-64"
          />
          <datalist id="section-name-suggestions">
            {knownSectionNames.map((n) => <option key={n} value={n} />)}
          </datalist>
        </div>
        <div>
          <label className="block text-xs text-zinc-500 mb-1">Visible to</label>
          <select name="audience" className="bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-zinc-500">
            <option value="both">Students &amp; instructors</option>
            <option value="instructor">Instructors only</option>
          </select>
        </div>
        <button type="submit" className="px-4 py-2 bg-pr-red hover:bg-pr-red-dark text-white rounded text-sm font-medium transition-colors">Add section</button>
      </form>
    
    </div>
  )
}
