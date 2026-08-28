import { LinkIcon, PaperclipIcon } from '@/components/TaskIcons'
import { linkLabel } from '@/lib/course-links'
import type { MeetingLink, MeetingFile } from '@/lib/meeting-details'

// Something to tap. The meeting point is unclickable text, and on a phone at
// 0855 what you want is the map, not the address.
//
// Extracted from the meeting block when the links behind it moved onto the
// site: the same three pins now appear both there and on every schedule day
// pointing at that place, and two renderings of one thing is how the day ended
// up with grey underlines where the block had chips.
//
// Teal is an outside link and zinc is a file we hold — the same pairing
// TaskDocChip uses, so a pin means the same thing wherever you meet it.

export function LinkChip({ link }: { link: MeetingLink }) {
  return (
    <a
      href={link.url}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1.5 max-w-full px-3 py-1.5 rounded-full border border-teal-500/30 bg-teal-500/10 text-teal-300 hover:border-teal-400 hover:text-teal-100 text-sm transition-colors"
    >
      <LinkIcon />
      <span className="truncate">{linkLabel(link)}</span>
      <span className="text-teal-400/70 shrink-0">↗</span>
    </a>
  )
}

export function FileChip({ file }: { file: MeetingFile }) {
  return (
    <a
      href={file.url}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1.5 max-w-full px-3 py-1.5 rounded-full border border-zinc-700 bg-zinc-800 text-zinc-300 hover:border-zinc-500 hover:text-white text-sm transition-colors"
    >
      <span className="shrink-0"><PaperclipIcon /></span>
      <span className="truncate">{file.filename}</span>
    </a>
  )
}

/** The row as both blocks draw it: links first, then anything we hold. */
export function ChipRow({ links, files }: { links: MeetingLink[]; files?: MeetingFile[] }) {
  if (!links.length && !(files ?? []).length) return null
  return (
    <div className="flex flex-wrap gap-2">
      {links.map((l, i) => <LinkChip key={`l${i}`} link={l} />)}
      {(files ?? []).map((f, i) => <FileChip key={`f${i}`} file={f} />)}
    </div>
  )
}
