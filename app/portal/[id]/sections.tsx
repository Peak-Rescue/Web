import React from 'react'

// Presentational shell for the portal page. Every top-level block on a course
// is a Section: same icon-and-rule header, same spacing, its own anchor. The
// point is that a student scrolling past can always name what they're looking
// at without reading the contents.

export type SectionKey =
  | 'about'
  | 'schedule'
  | 'curriculum'
  | 'equipment'
  | 'documents'
  | 'tasks'
  | 'notes'

export const SECTION_ICON: Record<SectionKey, React.ReactElement> = {
  about: (
    <path d="M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20ZM12 16v-4M12 8h.01" />
  ),
  schedule: (
    <path d="M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z" />
  ),
  curriculum: (
    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z" />
  ),
  equipment: (
    <path d="M6 2h12l-1 7H7L6 2ZM7 9h10l1.5 11a2 2 0 0 1-2 2h-9a2 2 0 0 1-2-2L7 9ZM10 13h4" />
  ),
  documents: (
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M16 13H8M16 17H8" />
  ),
  tasks: (
    <path d="M9 11l3 3L22 4M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
  ),
  notes: (
    <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
  ),
}

export const SECTION_LABEL: Record<SectionKey, string> = {
  about: 'Course info',
  schedule: 'Schedule',
  curriculum: 'Curriculum',
  equipment: 'Equipment',
  documents: 'Documents',
  tasks: 'Tasks',
  notes: 'Notes',
}

export function Section({
  id,
  title,
  blurb,
  team,
  children,
}: {
  id: SectionKey
  title?: string
  blurb?: string
  /** Team-only block: tinted and badged so it reads as not-for-students. */
  team?: boolean
  children: React.ReactNode
}) {
  return (
    <section id={id} className="scroll-mt-30 md:scroll-mt-36 mb-12">
      <div className="flex items-center gap-3 mb-4 pb-3 border-b border-zinc-800">
        <span
          className={`grid place-items-center w-8 h-8 rounded-lg border shrink-0 ${
            team
              ? 'border-amber-900/70 bg-amber-950/30 text-amber-400'
              : 'border-zinc-800 bg-zinc-900 text-zinc-400'
          }`}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            {SECTION_ICON[id]}
          </svg>
        </span>
        <div className="min-w-0">
          <h2 className="text-lg font-semibold leading-tight">{title ?? SECTION_LABEL[id]}</h2>
          {blurb && <p className="text-xs text-zinc-500 mt-0.5">{blurb}</p>}
        </div>
        {team && (
          <span className="ml-auto shrink-0 text-[10px] font-medium uppercase tracking-wide px-2 py-0.5 rounded-full border border-amber-900/70 text-amber-500">
            Team only
          </span>
        )}
      </div>
      {children}
    </section>
  )
}

/** A named group inside a section — a module, a gear group, a day. */
export function SubHead({ title, note, badge }: { title: string; note?: string; badge?: React.ReactNode }) {
  return (
    <div className="flex items-baseline gap-2 mb-2">
      <h3 className="text-sm font-semibold text-zinc-200">{title}</h3>
      {note && <span className="text-xs text-zinc-500">{note}</span>}
      {badge}
    </div>
  )
}

/** Roster row — names with the role spelled out, not left to a colour. */
export function InstructorCard({ name, role }: { name: string; role: string }) {
  const lead = role === 'lead'
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase()
  return (
    <div className="flex items-center gap-2.5 px-3 py-2 rounded-lg border border-zinc-800 bg-zinc-900">
      <span
        className={`grid place-items-center w-8 h-8 rounded-full text-xs font-semibold shrink-0 ${
          lead ? 'bg-teal-900/50 text-teal-300' : 'bg-zinc-800 text-zinc-400'
        }`}
      >
        {initials}
      </span>
      <div className="min-w-0">
        <div className="text-sm font-medium leading-tight truncate">{name}</div>
        <div className="text-[11px] text-zinc-500 leading-tight">
          {lead ? 'Lead instructor' : 'Assistant instructor'}
        </div>
      </div>
    </div>
  )
}
