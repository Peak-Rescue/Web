// This link leaves the page for a new tab.
//
// The arrows already meant something before this: ← goes up a level, → goes
// on to the next page in the same tab. Neither says "your half-built course
// stays where it is", which is the whole reason these links open a tab of
// their own — so they get the box-and-arrow the site already uses on a link
// out to Drive, a map, or the gear catalog.
//
// Sized for a text-xs line, like the trash icon it sits alongside.
export default function NewTabIcon({ className = '' }: { className?: string }) {
  return (
    <svg
      aria-hidden
      xmlns="http://www.w3.org/2000/svg"
      width="11"
      height="11"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M15 3h6v6M10 14 21 3M21 14v7H3V3h7" />
    </svg>
  )
}
