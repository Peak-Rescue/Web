import React from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { AudiencePills } from '@/components/AudiencePills'

// Presentational shell for the portal page. Every top-level block on a course
// is a Section: same icon-and-rule header, same spacing, its own anchor. The
// point is that a student scrolling past can always name what they're looking
// at without reading the contents.

export type SectionKey =
  | 'details'
  | 'about'
  | 'schedule'
  | 'curriculum'
  | 'resources'
  | 'gear'
  | 'documents'
  | 'roster'
  | 'tasks'
  | 'notes'
  | 'updates'
  | 'message'

export const SECTION_ICON: Record<SectionKey, React.ReactElement> = {
  // 'details' is the page header rather than a Section, so its icon is only
  // ever used if that block later grows a header of its own.
  details: (
    <path d="M4 6h16M4 12h16M4 18h10" />
  ),
  about: (
    <path d="M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20ZM12 16v-4M12 8h.01" />
  ),
  schedule: (
    <path d="M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z" />
  ),
  // The open book, matching the one that heads a schedule day's topics. Two
  // books differing only in being open or closed doesn't read as a
  // distinction — it reads as a mistake. Same idea, same glyph; where you
  // meet it says which one you're looking at.
  curriculum: (
    <>
      <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
      <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
    </>
  ),
  // Reference for this place — the med plan, the permit. A document with a
  // bookmark, not the plain page 'documents' uses: what marks these out is
  // that you come back to them mid-course, not that they are files.
  resources: (
    <>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6" />
      <path d="M15 22v-7l-2.5 1.75L10 15v7" />
    </>
  ),
  gear: (
    <path d="M6 2h12l-1 7H7L6 2ZM7 9h10l1.5 11a2 2 0 0 1-2 2h-9a2 2 0 0 1-2-2L7 9ZM10 13h4" />
  ),
  documents: (
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M16 13H8M16 17H8" />
  ),
  // Two figures, not one: the roster is the group on the course, and the
  // single-person glyph is already what an avatar slot means elsewhere.
  roster: (
    <>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <path d="M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
    </>
  ),
  tasks: (
    <path d="M9 11l3 3L22 4M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
  ),
  notes: (
    <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
  ),
  updates: (
    <path d="M3 11l18-8-8 18-2-8-8-2Z" />
  ),
  message: (
    <path d="M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2ZM22 7l-10 6L2 7" />
  ),
}

export const SECTION_LABEL: Record<SectionKey, string> = {
  details: 'Details',
  about: 'Course info',
  schedule: 'Schedule',
  curriculum: 'Curriculum',
  resources: 'Resources',
  gear: 'Gear',
  documents: 'Documents',
  roster: 'Roster',
  tasks: 'Tasks',
  notes: 'Notes',
  updates: 'Updates',
  message: 'Email',
}

export function Section({
  id,
  title,
  blurb,
  team,
  unread,
  action,
  children,
}: {
  id: SectionKey
  title?: string
  blurb?: string
  /** Team-only block: tinted and badged so it reads as not-for-students. */
  team?: boolean
  /** Something in here is newer than this reader's last visit. */
  unread?: boolean
  /** A control for the block as a whole — the PDF of a gear list, say. Sits at
      the far end of the heading row, where the audience pill sits. */
  action?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section id={id} className="scroll-mt-30 md:scroll-mt-36 mb-12">
      {/* The heading carries a colour tick, the same device the gear catalog
          uses on its category headings: it gives the eye something to land on
          in a long scroll, and says whose block this is before the badge at
          the far end of the row does. */}
      <div className="relative flex items-center gap-3 mb-4 pb-3 border-b border-zinc-800">
        <span
          aria-hidden
          className={`absolute -left-3 top-1 w-[3px] h-5 rounded-full ${team ? 'bg-amber-500' : 'bg-pr-red'}`}
        />
        <span
          className={`relative grid place-items-center w-8 h-8 rounded-lg border shrink-0 ${
            team
              ? 'border-amber-900/70 bg-amber-950/30 text-amber-400'
              : 'border-zinc-800 bg-zinc-900 text-zinc-400'
          }`}
        >
          {unread && (
            <span
              aria-hidden
              className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-pr-red-light ring-2 ring-zinc-950"
            />
          )}
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
        {/* The same pills the library and the course editor use, so who can
            see a block reads identically wherever you meet it. */}
        {team && <AudiencePills audience="internal" className="ml-auto shrink-0" />}
        {action && <div className={team ? 'shrink-0' : 'ml-auto shrink-0'}>{action}</div>}
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

/**
 * Roster row — names with the role spelled out, not left to a colour. An
 * instructor with a public bio page links to it, so a student can find out
 * who they're spending the week with.
 */
export function InstructorCard({
  name,
  role,
  slug,
  avatar,
  avatarPosition,
  avatarScale,
}: {
  name: string
  role: string
  slug?: string | null
  avatar?: string | null
  avatarPosition?: string | null
  avatarScale?: number | null
}) {
  const lead = role === 'lead'
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase()

  const inner = (
    <>
      <span
        className={`grid place-items-center w-9 h-9 rounded-full overflow-hidden text-xs font-semibold shrink-0 ${
          lead ? 'bg-teal-900/50 text-teal-300' : 'bg-zinc-800 text-zinc-400'
        }`}
      >
        {avatar ? (
          <Image
            src={avatar}
            alt=""
            width={36}
            height={36}
            className="w-full h-full object-cover"
            style={{
              objectPosition: avatarPosition ?? 'center',
              transform: avatarScale ? `scale(${avatarScale})` : undefined,
              transformOrigin: avatarPosition ?? 'center',
            }}
          />
        ) : (
          initials
        )}
      </span>
      <div className="min-w-0">
        <div className="text-sm font-medium leading-tight truncate">{name}</div>
        <div className="text-[11px] text-zinc-500 leading-tight">
          {lead ? 'Lead instructor' : 'Assistant instructor'}
        </div>
      </div>
      {slug && (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="13"
          height="13"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="ml-auto shrink-0 text-zinc-600 group-hover:text-zinc-400 transition-colors"
        >
          <path d="M9 18l6-6-6-6" />
        </svg>
      )}
    </>
  )

  const box = 'flex items-center gap-2.5 px-3 py-2 rounded-lg border border-zinc-800 bg-zinc-900'
  if (!slug) return <div className={box}>{inner}</div>
  return (
    <Link href={`/team/${slug}`} className={`${box} group hover:border-zinc-600 transition-colors`}>
      {inner}
    </Link>
  )
}

/**
 * A student on the course, for the team's roster. Deliberately not an
 * InstructorCard: there is no bio page to link to and no role to spell out —
 * what an instructor wants off this row is a way to reach the person, so the
 * email and phone are live links rather than text to copy out.
 */
export function StudentCard({
  name,
  email,
  phone,
  enrolledAt,
}: {
  name: string
  email?: string | null
  phone?: string | null
  enrolledAt?: string | null
}) {
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase()

  return (
    <div className="flex items-center gap-2.5 px-3 py-2 rounded-lg border border-zinc-800 bg-zinc-900">
      <span className="grid place-items-center w-9 h-9 rounded-full bg-zinc-800 text-zinc-400 text-xs font-semibold shrink-0">
        {initials || '?'}
      </span>
      <div className="min-w-0">
        <div className="text-sm font-medium leading-tight truncate">{name}</div>
        <div className="text-[11px] text-zinc-500 leading-tight truncate">
          {email && (
            <a href={`mailto:${email}`} className="hover:text-zinc-300 transition-colors">
              {email}
            </a>
          )}
          {email && phone && <span className="text-zinc-700"> · </span>}
          {phone && (
            <a href={`tel:${phone}`} className="hover:text-zinc-300 transition-colors">
              {phone}
            </a>
          )}
          {!email && !phone && 'No contact details on file'}
        </div>
      </div>
      {enrolledAt && (
        <span className="ml-auto shrink-0 text-[11px] text-zinc-600">
          Joined {new Date(enrolledAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
        </span>
      )}
    </div>
  )
}
