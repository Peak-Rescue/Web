// Editing what is already written, as opposed to adding something new.
//
// Was local to the schedule editor until the billers' list needed the same
// mark: "Edit" spelled out was one of six worded buttons on a row, and a row
// of words reads as a paragraph to skim rather than controls to use.
//
// Sized to sit in a text-xs line like the trash icon it sits alongside; pass
// a class to shrink it where the line is smaller.
export default function PencilIcon({ className = '' }: { className?: string }) {
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
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  )
}
