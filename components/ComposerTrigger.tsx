// The way into a composer, before it takes up any room.
//
// Two of these sit in the Updates section — posting an update, and sending an
// email — and they used to disagree about what they were: one box permanently
// open, one button labelled "Write a message" with a sentence beside it
// explaining the difference. Same act, two shapes, and a paragraph to tell
// them apart.
//
// One shape now. It looks like the field it becomes, so pressing it is
// obvious, and what it says is what it does.
export default function ComposerTrigger({
  label,
  icon,
  onClick,
}: {
  label: string
  icon: React.ReactNode
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-2.5 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2.5 text-left text-sm text-zinc-500 hover:border-zinc-700 hover:text-zinc-300 transition-colors"
    >
      <span className="shrink-0 text-zinc-600">{icon}</span>
      {label}
    </button>
  )
}

export function SendIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="m22 2-7 20-4-9-9-4Z" />
      <path d="M22 2 11 13" />
    </svg>
  )
}

export function MailIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <path d="m2 7 10 6 10-6" />
    </svg>
  )
}

export function NoteIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M15 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h9l5-5V5a2 2 0 0 0-2-2Z" />
      <path d="M14 21v-3a2 2 0 0 1 2-2h3" />
    </svg>
  )
}
