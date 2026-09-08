import { KIND_META, materialKind, type LibraryItem } from '@/lib/library'
import { AudiencePills } from '@/components/AudiencePills'

// One library item, read-only.
//
// This is the row the reference page had, moved here whole: the library used
// to be two pages, one that could edit every row and one that could only read
// them, and only the second knew how to *open* a document — the Drive proxy,
// the separate instructors' copy. Now the two are one page and this is what
// everyone gets; LibraryRow, which is an edit form pretending to be a row,
// renders instead for the admins who can change something.

export default function ItemRow({
  item,
  venueName,
}: {
  item: LibraryItem
  venueName?: string | null
}) {
  // Drive links go through our own route: it holds the sharing rules, and a
  // raw Drive URL asks whoever clicked it to request access from a stranger.
  const href =
    item.url && (item.drive_file_id || materialKind(item) === 'doc')
      ? `/api/library/${item.id}`
      : item.url

  return (
    <div className="px-4 py-2.5 flex items-center gap-3">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          {href ? (
            <a
              href={href}
              target="_blank"
              rel="noreferrer"
              className="text-sm font-medium hover:text-pr-red-light transition-colors truncate"
            >
              {item.title}
            </a>
          ) : (
            <span className="text-sm font-medium truncate">{item.title}</span>
          )}
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 shrink-0">
            {KIND_META[item.kind as keyof typeof KIND_META] ?? item.kind}
          </span>
          {venueName && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-900/40 text-blue-300 shrink-0">
              {venueName}
            </span>
          )}
          {item.audience === 'internal' && <AudiencePills audience="internal" className="shrink-0" />}
        </div>
        {(item.description || item.topics.length > 0) && (
          <p className="text-[11px] text-zinc-600 mt-0.5 truncate">
            {item.description ?? item.topics.filter((t) => t !== 'needs-link-check').join(', ')}
          </p>
        )}
      </div>
      {item.edit_url && (
        <a
          href={item.edit_url}
          target="_blank"
          rel="noreferrer"
          title="The team's copy — never shown to participants"
          className="shrink-0 text-[10px] px-1.5 py-0.5 rounded border border-zinc-700 text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          instructors
        </a>
      )}
    </div>
  )
}
