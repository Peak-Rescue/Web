import Link from 'next/link'

export type CalendarCourse = {
  id: string
  label: string
  status: string
  starts_at: string // yyyy-mm-dd
  ends_at: string
  href?: string // absent → rendered as a non-clickable chip
  category?: string | null // course_category; 'tactical' → military, anything else → civilian
}

// Military vs civilian accent — same designation rule as the Google Calendar
// sync (course_category 'tactical' → military, everything else → civilian).
const CATEGORY_DOT = {
  military: 'bg-orange-400',
  civilian: 'bg-cyan-400',
}

// Solidity mirrors certainty: confirmed/completed chips are filled, quoted is
// outline-only, tentative is a dashed outline.
const STATUS_CHIP: Record<string, string> = {
  tentative: 'border-dashed border-yellow-700 text-yellow-300',
  quoted: 'border-blue-700 text-blue-300',
  confirmed: 'bg-teal-800/80 text-teal-100 border-teal-700',
  completed: 'bg-zinc-800 text-zinc-400 border-zinc-700',
  cancelled: 'bg-red-900/50 text-red-300 border-red-900 line-through',
}

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10)
}

// Server-rendered month grid. Courses render as chips on every day of their
// span; month navigation is plain links (?cal=yyyy-mm).
export default function CourseCalendar({
  month, // 'yyyy-mm'
  courses,
  basePath,
  params,
  category,
}: {
  month: string
  courses: CalendarCourse[]
  basePath: string
  params?: Record<string, string> // extra query params to preserve in month-nav links
  category?: string | null // active military/civilian filter (?cat=), toggled via the legend
}) {
  const catFilter = category === 'military' || category === 'civilian' ? category : null
  const isMilitary = (c: CalendarCourse) => c.category === 'tactical'
  const visible = catFilter
    ? courses.filter((c) => (catFilter === 'military') === isMilitary(c))
    : courses

  const navHref = (m?: string) => {
    const q = new URLSearchParams(params)
    if (catFilter) q.set('cat', catFilter)
    if (m) q.set('cal', m)
    const s = q.toString()
    return s ? `${basePath}?${s}` : basePath
  }

  // Legend-pill links: set the filter, or clear it when already active.
  // Always carry the shown month so pages whose calendar panel opens off the
  // ?cal param keep it expanded.
  const catHref = (next: 'military' | 'civilian') => {
    const q = new URLSearchParams(params)
    q.set('cal', month)
    if (catFilter !== next) q.set('cat', next)
    return `${basePath}?${q.toString()}`
  }
  const [y, m] = month.split('-').map(Number)
  const first = new Date(Date.UTC(y, m - 1, 1))
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate()
  const leadBlanks = first.getUTCDay() // Sunday-start grid

  const prev = new Date(Date.UTC(y, m - 2, 1))
  const next = new Date(Date.UTC(y, m, 1))
  const fmtMonth = (d: Date) =>
    d.toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })

  const cells: (string | null)[] = [
    ...Array.from({ length: leadBlanks }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => ymd(new Date(Date.UTC(y, m - 1, i + 1)))),
  ]
  while (cells.length % 7 !== 0) cells.push(null)

  const todayStr = ymd(new Date())

  // Google-style multi-day bars: every course keeps one lane for its whole
  // span, so its per-day segments sit at the same height in adjacent cells
  // and read as a single connected bar. Greedy assignment, earliest start
  // first; a lane is reusable once its previous occupant has ended.
  const lanes = new Map<string, number>()
  const laneEnds: string[] = []
  for (const c of [...visible].sort(
    (a, b) => a.starts_at.localeCompare(b.starts_at) || a.ends_at.localeCompare(b.ends_at)
  )) {
    let lane = laneEnds.findIndex((end) => end < c.starts_at)
    if (lane === -1) lane = laneEnds.length
    laneEnds[lane] = c.ends_at
    lanes.set(c.id, lane)
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold">{fmtMonth(first)}</h3>
        <div className="flex gap-2 text-sm">
          <Link href={navHref(ymd(prev).slice(0, 7))} className="px-2 py-1 bg-zinc-800 hover:bg-zinc-700 rounded text-zinc-300 transition-colors">←</Link>
          <Link href={navHref()} className="px-2 py-1 bg-zinc-800 hover:bg-zinc-700 rounded text-zinc-300 transition-colors text-xs leading-5">Today</Link>
          <Link href={navHref(ymd(next).slice(0, 7))} className="px-2 py-1 bg-zinc-800 hover:bg-zinc-700 rounded text-zinc-300 transition-colors">→</Link>
        </div>
      </div>

      <div className="grid grid-cols-7 text-[10px] text-zinc-500 uppercase tracking-wide mb-1">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
          <div key={d} className="px-1.5 py-1">{d}</div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-px bg-zinc-800 border border-zinc-800 rounded-lg overflow-hidden">
        {cells.map((day, i) => {
          const active = day ? visible.filter((c) => c.starts_at <= day && day <= c.ends_at) : []
          // Slot each active course into its lane; gaps stay as invisible
          // spacers so higher lanes keep their vertical position.
          const bySlot: (CalendarCourse | undefined)[] = []
          for (const c of active) bySlot[lanes.get(c.id)!] = c
          return (
            <div key={i} className={`min-h-20 bg-zinc-950 p-1 ${day === todayStr ? 'bg-zinc-900' : ''}`}>
              {day && (
                <p className={`text-[10px] mb-1 ${day === todayStr ? 'text-pr-red-light font-bold' : 'text-zinc-600'}`}>
                  {Number(day.slice(8))}
                </p>
              )}
              <div className="space-y-0.5">
                {Array.from(bySlot, (c, lane) => {
                  if (!c) {
                    return (
                      <span key={lane} className="block px-1 py-0.5 border border-transparent text-[10px] leading-tight">
                        {' '}
                      </span>
                    )
                  }
                  // Segments continuing from/to a neighboring cell in the same
                  // row square off that edge and bleed across the cell padding
                  // and grid gap, joining into one bar. Labels render on the
                  // first segment and again at each week start.
                  const contLeft = day! > c.starts_at && i % 7 !== 0
                  const contRight = day! < c.ends_at && i % 7 !== 6
                  const chipClass = [
                    'block px-1 py-0.5 border text-[10px] leading-tight truncate',
                    STATUS_CHIP[c.status] ?? STATUS_CHIP.completed,
                    contLeft ? 'rounded-l-none border-l-0 -ml-[5px]' : 'rounded-l',
                    contRight ? 'rounded-r-none border-r-0 -mr-1' : 'rounded-r',
                  ].join(' ')
                  const text = contLeft ? ' ' : c.label
                  const dot = !contLeft && c.category !== undefined && (
                    <span
                      className={`inline-block w-1.5 h-1.5 rounded-full mr-1 align-middle ${
                        c.category === 'tactical' ? CATEGORY_DOT.military : CATEGORY_DOT.civilian
                      }`}
                    />
                  )
                  return c.href ? (
                    <Link key={c.id} href={c.href} title={c.label} className={`${chipClass} hover:brightness-125 transition`}>
                      {dot}
                      {text}
                    </Link>
                  ) : (
                    <span key={c.id} title={c.label} className={chipClass}>
                      {dot}
                      {text}
                    </span>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>

      {courses.some((c) => c.category !== undefined) && (
        <div className="flex items-center gap-1.5 mt-2 text-[10px]">
          {(['military', 'civilian'] as const).map((k) => (
            <Link
              key={k}
              href={catHref(k)}
              title={catFilter === k ? 'Show all courses' : `Show only ${k} courses`}
              className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full border transition-colors ${
                catFilter === k
                  ? 'bg-zinc-800 border-zinc-600 text-white'
                  : 'border-transparent text-zinc-500 hover:text-zinc-300'
              }`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${CATEGORY_DOT[k]} ${
                  catFilter && catFilter !== k ? 'opacity-40' : ''
                }`}
              />
              {k === 'military' ? 'Military' : 'Civilian'}
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
