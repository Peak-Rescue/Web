/**
 * "PDF" beside a gear list or a running order.
 *
 * A plain anchor, not a button that fetches: the route already renders the
 * document inline, so the browser's own PDF viewer opens with print and save
 * where people expect to find them — and nothing has to be downloaded before
 * you can tell whether you wanted it.
 *
 * Deliberately quiet. It sits in a heading row next to the thing it prints,
 * and a loud button there would compete with the list itself.
 */
export default function PdfLink({
  href,
  label = 'PDF',
  className = '',
}: {
  href: string
  label?: string
  className?: string
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      title="Open a printable PDF"
      className={`inline-flex items-center gap-1.5 shrink-0 text-xs px-2.5 py-1 rounded border border-zinc-800 text-zinc-400 hover:text-white hover:border-zinc-600 transition-colors ${className}`}
    >
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
      >
        <path d="M6 9V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v5" />
        <path d="M6 18H5a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-1" />
        <path d="M7 15h10v6H7z" />
      </svg>
      {label}
    </a>
  )
}
