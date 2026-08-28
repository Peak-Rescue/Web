// Removing a row, as opposed to closing what it sits in.
//
// Both were a cross. Once the cross became the way out of every editor on the
// site, the one at the end of a row started reading as "close this" to anyone
// glancing — and it deleted instead. A bin cannot be mistaken for a way out.
//
// Sized to sit in a text-xs line, so it drops into the buttons that used to
// hold the glyph without changing their shape.
export default function TrashIcon({ className = '' }: { className?: string }) {
  return (
    <svg
      aria-hidden
      xmlns="http://www.w3.org/2000/svg"
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" />
      <path d="M19 6v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V6" />
      <path d="M10 11v6M14 11v6" />
    </svg>
  )
}
