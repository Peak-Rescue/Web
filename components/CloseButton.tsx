// Closing an editor, in the corner people already look for it.
//
// These were words at the bottom — "Cancel", "Done", "Close" — which means
// finding the way out involves reading to the end of a form to look for it,
// and the word differed depending on which editor you were in. One mark, one
// place: top right, where every window anyone has ever closed puts it.
//
// The primary action stays where it is. This is the way out, not the way
// through: whatever the editor's save button says, it still says it.
export default function CloseButton({
  onClick,
  label = 'Close',
  disabled,
  className = '',
}: {
  onClick: () => void
  /** What closing does here, for anyone not looking at the mark — "Cancel",
      "Done editing". Read by screen readers and shown on hover. */
  label?: string
  disabled?: boolean
  className?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={`shrink-0 rounded p-1 text-zinc-500 hover:text-white hover:bg-zinc-800 transition-colors disabled:opacity-40 ${className}`}
    >
      <svg
        aria-hidden
        xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24"
        fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"
      >
        <path d="M18 6 6 18" />
        <path d="m6 6 12 12" />
      </svg>
    </button>
  )
}
