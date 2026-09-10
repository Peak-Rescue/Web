// The head of a fold that holds a list: what it is, how much is in it, and
// what the parts are.
//
// Closed, a fold used to be a caret and a word — you had to open it to learn
// whether it held thirty rows or nothing. Naming the parts fixed that and
// introduced its own problem: one run of dot-separated names is the same shape
// at four parts as at twelve, so there is nothing for the eye to land on and no
// way to see that one part is most of the list. Each part gets its own tile
// with its own count instead, and the row of tiles is the structure.
//
// A panel rather than a bare line, now that there is something in it. Two
// summaries floating in an open section read as two loose ends; the same two
// with a border around each read as two things you can choose between. The
// border was not worth adding when the line said "Curriculum" and nothing
// else — the facts came first, and the container followed them.
export function FoldHead({
  title, total, parts, open,
}: {
  title: string
  /** The whole, said once on the right — "19 items". */
  total: string
  /** The parts, in the order they are written. Empty is a real answer: a list
      with no headings has no index to show, and its total says everything. */
  parts: { label: string; count: number }[]
  /** Which fold this is, for the open/closed variant class. `<details>` hides
      everything but its summary when closed, so the index has to live inside
      the summary and hide itself the other way round. */
  open: 'gear' | 'curric'
}) {
  const hide = open === 'gear' ? 'group-open/gear:hidden' : 'group-open/curric:hidden'
  const turn = open === 'gear' ? 'group-open/gear:rotate-90' : 'group-open/curric:rotate-90'
  return (
    <summary className="cursor-pointer list-none px-3 py-2.5 rounded-lg hover:bg-zinc-900/60 transition-colors">
      <div className="flex items-baseline gap-2">
        <span aria-hidden className={`shrink-0 text-[10px] text-zinc-600 transition-transform ${turn}`}>▸</span>
        <h3 className="text-sm font-semibold text-zinc-200">{title}</h3>
        <span className={`ml-auto shrink-0 text-[11px] text-zinc-500 ${parts.length ? '' : hide}`}>{total}</span>
      </div>
      {parts.length > 0 && (
        <div className={`mt-2 ml-4 flex flex-wrap gap-1.5 ${hide}`}>
          {parts.map((p) => (
            // Not a button and not a link. Clicking one opens the fold, the
            // same as clicking anywhere else on this row — a tile that looked
            // pressable and only did what the whole row does is a promise of
            // something more specific than it delivers.
            <span
              key={p.label}
              className="inline-flex items-baseline gap-1.5 rounded border border-zinc-800 bg-zinc-900/80 px-2 py-1 text-[11px] text-zinc-400"
            >
              <span className="truncate max-w-[16rem]">{p.label}</span>
              <span className="text-zinc-600 tabular-nums">{p.count}</span>
            </span>
          ))}
        </div>
      )}
    </summary>
  )
}

// The wrapper the fold sits in. Here rather than repeated at each call site so
// that the two halves of Prep cannot drift apart the way their summaries did.
export const FOLD_PANEL = 'rounded-lg border border-zinc-800 bg-zinc-900/30'
