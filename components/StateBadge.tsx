// Something about the filing, rather than something about the material.
//
// "Instructors" and "needs sorting" had both ended up amber on the same row,
// and they are not the same kind of fact: one says who the thing is for, the
// other says nobody has finished putting it away. Re-colouring the audience
// pill would have meant re-colouring instructor amber in fifty places across
// the portal, where it is already consistent and already learned.
//
// So they differ by shape instead of hue, which holds whatever the palette
// does later: an audience pill is a solid fill, and a state badge is an
// outline with nothing behind it — a note pinned to the row, not a property
// of it. Colour then only has to carry urgency: amber for something to do,
// red for something that may already be broken.
export default function StateBadge({
  tone = 'todo',
  title,
  children,
}: {
  tone?: 'todo' | 'broken'
  title?: string
  children: React.ReactNode
}) {
  return (
    <span
      title={title}
      className={`text-[10px] px-1.5 py-0.5 rounded border bg-transparent ${
        tone === 'broken'
          ? 'border-red-500/50 text-red-300'
          : 'border-amber-500/40 text-amber-300/90'
      }`}
    >
      {children}
    </span>
  )
}
