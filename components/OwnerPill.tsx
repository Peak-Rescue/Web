import Image from 'next/image'
import { type CourseOwner } from '@/lib/course-owner'

// Whose course this is, as a face and a name.
//
// The same shape as the crew cards on the course itself — a round photo, or
// initials where there is none — because it is the same kind of fact and
// inventing a second way to draw a person is how two screens stop agreeing
// about who somebody is.
//
// No owner is drawn, never blanked. A course nobody has taken on is the one
// that stalls, so it gets a dashed amber outline and says so.
export default function OwnerPill({
  owner,
  className = '',
}: {
  owner: CourseOwner | null
  className?: string
}) {
  if (!owner) {
    return (
      <span
        className={`inline-flex items-center gap-2 pl-1 pr-2.5 py-0.5 rounded-full border border-dashed border-amber-600/70 bg-amber-500/10 text-amber-300 text-xs ${className}`}
      >
        <span className="grid place-items-center w-5 h-5 rounded-full bg-amber-500/20 text-[9px] font-bold">?</span>
        No owner
      </span>
    )
  }

  return (
    <span
      className={`inline-flex items-center gap-2 pl-1 pr-2.5 py-0.5 rounded-full border border-zinc-700 bg-zinc-800/70 text-zinc-300 text-xs ${className}`}
    >
      <span className="grid place-items-center w-5 h-5 rounded-full overflow-hidden bg-zinc-700 text-[9px] font-bold text-zinc-200 shrink-0">
        {owner.avatar ? (
          <Image
            src={owner.avatar}
            alt=""
            width={20}
            height={20}
            className="w-full h-full object-cover"
            style={{
              objectPosition: owner.avatarPosition ?? 'center',
              transform: owner.avatarScale ? `scale(${owner.avatarScale})` : undefined,
              transformOrigin: owner.avatarPosition ?? 'center',
            }}
          />
        ) : (
          owner.initials
        )}
      </span>
      {owner.name}
    </span>
  )
}
