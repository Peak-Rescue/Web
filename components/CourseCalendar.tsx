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

// Chips are colored by designation like the Google calendars — military vs
// civilian, same rule as the sync (course_category 'tactical' → military,
// everything else → civilian) — while status shows as solidity: confirmed
// filled, quoted outlined, tentative dashed, completed dimmed.
const CATEGORY_STYLE = {
  military: {
    swatch: 'bg-orange-400',
    solid: 'bg-orange-900/80 text-orange-100 border-orange-700',
    outline: 'border-orange-700 text-orange-300',
  },
  civilian: {
    swatch: 'bg-cyan-400',
    solid: 'bg-cyan-900/80 text-cyan-100 border-cyan-700',
    outline: 'border-cyan-700 text-cyan-300',
  },
}

function chipStyle(c: CalendarCourse): string {
  const s = CATEGORY_STYLE[c.category === 'tactical' ? 'military' : 'civilian']
  switch (c.status) {
    case 'tentative':
      return `${s.outline} border-dashed`
    case 'quoted':
      return s.outline
    case 'completed':
      return `${s.solid} opacity-60`
    case 'cancelled':
      return 'bg-red-900/50 text-red-300 border-red-900 line-through'
    default:
      return s.solid // confirmed
  }
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

  // Legend-checkbox links: next is the category to show alone, or null for
  // both. Always carry the shown month so pages whose calendar panel opens
  // off the ?cal param keep it expanded.
  const catHref = (nextFilter: 'military' | 'civilian' | null) => {
    const q = new URLSearchParams(params)
    q.set('cal', month)
    if (nextFilter) q.set('cat', nextFilter)
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
                    chipStyle(c),
                    contLeft ? 'rounded-l-none border-l-0 -ml-[5px]' : 'rounded-l',
                    contRight ? 'rounded-r-none border-r-0 -mr-1' : 'rounded-r',
                  ].join(' ')
                  const text = contLeft ? ' ' : c.label
                  return c.href ? (
                    <Link key={c.id} href={c.href} title={c.label} className={`${chipClass} hover:brightness-125 transition`}>
                      {text}
                    </Link>
                  ) : (
                    <span key={c.id} title={c.label} className={chipClass}>
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
        <div className="flex items-center gap-4 mt-2 text-[10px]">
          {/* Checkbox semantics: both checked by default; unchecking one
              leaves the other. Unchecking the last checked box flips to the
              other category instead of an empty calendar. */}
          {(['military', 'civilian'] as const).map((k) => {
            const other = k === 'military' ? ('civilian' as const) : ('military' as const)
            const checked = catFilter !== other
            return (
              <Link
                key={k}
                href={catHref(checked ? other : null)}
                title={checked ? `Hide ${k} courses` : `Show ${k} courses`}
                className={`flex items-center gap-1.5 transition-colors ${
                  checked ? 'text-zinc-300 hover:text-white' : 'text-zinc-600 hover:text-zinc-400'
                }`}
              >
                <span
                  className={`flex items-center justify-center w-3 h-3 rounded-sm border ${
                    checked ? `${CATEGORY_STYLE[k].swatch} border-transparent text-zinc-950` : 'border-zinc-600'
                  }`}
                >
                  {checked && (
                    <svg xmlns="http://www.w3.org/2000/svg" width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M20 6 9 17l-5-5" />
                    </svg>
                  )}
                </span>
                {k === 'military' ? 'Military' : 'Civilian'}
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
