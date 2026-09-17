// Where a thing has got to, said the same way wherever it is shown.
//
// There were two of these: quotes rendered their raw status lowercase at ten
// pixels, invoice requests rendered prose at eleven with different padding.
// Same idea, same page, two looks — and the raw one leaked the database's
// word for things, so a quote said "sent" where a request said "With Harken".
//
// The colours mean something and are worth keeping steady: zinc is not
// started, blue is in somebody else's hands, teal is agreed, emerald is money
// that arrived, red is refused, and a struck-through zinc is withdrawn.

const TONE = {
  idle: 'bg-zinc-800 text-zinc-400',
  waiting: 'bg-blue-900/60 text-blue-300',
  agreed: 'bg-teal-900/60 text-teal-300',
  paid: 'bg-emerald-900/50 text-emerald-300',
  refused: 'bg-red-900/50 text-red-300',
  gone: 'bg-zinc-900 text-zinc-600',
} as const

export type ChipTone = keyof typeof TONE

export default function StatusChip({
  tone = 'idle',
  children,
}: {
  tone?: ChipTone
  children: React.ReactNode
}) {
  return (
    <span className={`shrink-0 px-2 py-0.5 text-[11px] font-medium rounded ${TONE[tone]}`}>{children}</span>
  )
}

/** How a quote's status reads and reads as. The database's words are short
    because they are keys; a person wants to know whether the client has seen
    it, which "sent" only half answers. */
export const QUOTE_STATUS: Record<string, { label: string; tone: ChipTone }> = {
  draft: { label: 'Draft', tone: 'idle' },
  sent: { label: 'With the client', tone: 'waiting' },
  accepted: { label: 'Accepted', tone: 'agreed' },
  declined: { label: 'Declined', tone: 'refused' },
  expired: { label: 'Expired', tone: 'gone' },
}
