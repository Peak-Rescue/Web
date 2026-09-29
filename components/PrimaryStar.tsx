// The mark for whoever is running the course.
//
// Primary spent a day as a pill, sitting in a row of pills that said Lead,
// Assist and Shadow — so it read as a fourth wage band, which is the one thing
// it is not. A pill beside pills is a peer whatever you write in it.
//
// So it stops being a pill. It is a star on the person: a different shape, in a
// channel the bands do not use, and it attaches to the name rather than sitting
// in the row of categories. Filled when they are primary, outlined when the star
// is something you can press to make them one.
//
// Never the only channel. Every use pairs it with the word — a title at minimum,
// and the word itself wherever the space allows — because a glyph nobody has
// been taught is decoration, and a student reading their course roster has been
// taught nothing about our stars.
export default function PrimaryStar({
  filled = true,
  className = '',
}: {
  /** Filled says "is". Outlined says "could be" — a control, not a statement. */
  filled?: boolean
  className?: string
}) {
  return (
    <svg
      aria-hidden
      xmlns="http://www.w3.org/2000/svg"
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M12 2.5l2.9 5.9 6.6.9-4.8 4.6 1.2 6.5-5.9-3.1-5.9 3.1 1.2-6.5L2.5 9.3l6.6-.9Z" />
    </svg>
  )
}
