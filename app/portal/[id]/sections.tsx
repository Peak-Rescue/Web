import React from 'react'
import Link from 'next/link'
import Image from 'next/image'
import WaiverDetach from '@/components/WaiverDetach'

// Presentational shell for the portal page. Every top-level block on a course
// is a Section: same icon-and-rule header, same spacing, its own anchor. The
// point is that a student scrolling past can always name what they're looking
// at without reading the contents.

// Fewer, bigger blocks, named the same as the course editor's tabs wherever
// the two screens mean the same thing. What used to be About, Roster, Notes,
// Documents and Email are now parts of the block they always belonged to:
// nobody was looking for "the roster" as distinct from "who's on this course".
// Four doors and the money. What used to be nine is grouped by when you reach
// for a thing rather than by what it is: who is on the course and what it is
// (details), what you deal with away from the canyon (prep), the day and the
// place you are standing in (schedule), and news (updates). Staffing, the
// roster, the waiver, the gear list, the curriculum, the maps and the med plan
// are all still here — as blocks inside the section that owns them.
export type SectionKey =
  | 'details'
  | 'prep'
  | 'schedule'
  | 'updates'
  | 'pricing'

export const SECTION_ICON: Record<SectionKey, React.ReactElement> = {
  // A pack with a page in it: what you bring, and what you read before you
  // bring it.
  prep: (
    <>
      <path d="M6 8h12a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-9a2 2 0 0 1 2-2Z" />
      <path d="M9 8V5a3 3 0 0 1 6 0v3M9 13h6M9 17h4" />
    </>
  ),
  // A price tag. Admins only, and the only section on the page a client's
  // money is discussed in.
  pricing: (
    <path d="M3 3h7l11 11-7 7L3 10V3ZM7.5 7.5h.01" />
  ),
  // Everything about this delivery and everyone on it: the welcome, where to
  // meet, the crew, the roster.
  details: (
    <path d="M4 6h16M4 12h16M4 18h10" />
  ),
  schedule: (
    <path d="M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z" />
  ),
  updates: (
    <path d="M3 11l18-8-8 18-2-8-8-2Z" />
  ),
}

export const SECTION_LABEL: Record<SectionKey, string> = {
  details: 'Details',
  prep: 'Prep',
  schedule: 'Schedule',
  updates: 'Updates',
  pricing: 'Pricing',
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
        {/* No pill: a team block is already amber-ticked and amber-iconed, and
            the section only renders for people who can see it. The pill is
            kept for the rows *inside* a block, where one item held back among
            shared ones is genuinely worth marking. */}
        {action && <div className="ml-auto shrink-0">{action}</div>}
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
  href,
  waiver,
  duplicate,
}: {
  name: string
  email?: string | null
  phone?: string | null
  enrolledAt?: string | null
  /** Their page, for staff. Students never get one to follow. */
  href?: string
  /** Whether they've signed, and how much the signature is worth. Undefined
      when the course has no waiver, so the row says nothing rather than
      implying something is outstanding. */
  waiver?: {
    signed: boolean
    unverified: boolean
    /** The signature itself, for the copy and the way back out of a bad match. */
    signatureId?: string | null
    signedAt?: string | null
    /** Who put their name to it, when that wasn't the student — a guardian. */
    signerName?: string | null
    instanceId?: string
  }
  /** Somebody else on this course is entered under the same name. */
  duplicate?: boolean
}) {
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase()

  // Only the name is a link. The row can't be one: the email and phone below
  // are links of their own, and an anchor inside an anchor is neither valid
  // nor tappable in the way either of them wants to be.
  return (
    <div className="flex items-center gap-2.5 px-3 py-2 rounded-lg border border-zinc-800 bg-zinc-900">
      <span className="grid place-items-center w-9 h-9 rounded-full bg-zinc-800 text-zinc-400 text-xs font-semibold shrink-0">
        {initials || '?'}
      </span>
      <div className="min-w-0">
        <div className="text-sm font-medium leading-tight truncate">
          {/* One card per student, so prefetching would mean a server render
              of every person on the roster the moment it scrolls into view. */}
          {href ? (
            <Link href={href} prefetch={false} className="hover:text-white hover:underline transition-colors">
              {name}
            </Link>
          ) : name}
        </div>
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
      {/* Everything the waiver roster used to say in a list of its own: the
          state, the day it was signed, the copy, and the way back out of a
          match somebody guessed at. One roster, because two lists of the same
          eight people is how one of them ends up believed over the other. */}
      <div className="ml-auto shrink-0 text-right">
        {waiver && (
          <div className={`text-[11px] ${waiver.signed ? 'text-teal-400' : 'text-amber-400'}`}>
            {waiver.signed
              ? waiver.unverified ? 'Waiver · via QR' : 'Waiver signed'
              : 'Waiver not signed'}
            {waiver.signed && waiver.signatureId && (
              <>
                <span className="text-zinc-700"> · </span>
                <a
                  href={`/api/waivers/${waiver.signatureId}/pdf`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-zinc-400 hover:text-zinc-200 underline transition-colors"
                >
                  PDF
                </a>
              </>
            )}
          </div>
        )}
        <div className="text-[11px] text-zinc-600 leading-tight">
          {waiver?.signed && waiver.signedAt
            ? `Signed ${new Date(waiver.signedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}${
                waiver.signerName ? ` by ${waiver.signerName}` : ''
              }`
            : enrolledAt
              ? `Joined ${new Date(enrolledAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
              : null}
        </div>
        {waiver?.signed && waiver.unverified && waiver.signatureId && waiver.instanceId && (
          <WaiverDetach instanceId={waiver.instanceId} signatureId={waiver.signatureId} />
        )}
        {/* Said on both rows rather than on the newer one: which of the two is
            the mistake is a question for whoever knows the person, and the
            answer is usually the one with no waiver. */}
        {duplicate && (
          <div className="text-[11px] text-amber-400" title="Another student on this course is entered under the same name — they may have joined twice with two addresses">
            Possible duplicate
          </div>
        )}
      </div>
    </div>
  )
}
