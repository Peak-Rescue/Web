import Link from 'next/link'

export type CalendarCourse = {
  id: string
  label: string
  status: string
  starts_at: string // yyyy-mm-dd
  ends_at: string
  href?: string // absent → rendered as a non-clickable chip
}

const STATUS_CHIP: Record<string, string> = {
  tentative: 'bg-yellow-900/60 text-yellow-200 border-yellow-800',
  quoted: 'bg-blue-900/60 text-blue-200 border-blue-800',
  confirmed: 'bg-teal-900/60 text-teal-200 border-teal-800',
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
}: {
  month: string
  courses: CalendarCourse[]
  basePath: string
  params?: Record<string, string> // extra query params to preserve in month-nav links
}) {
  const navHref = (m?: string) => {
    const q = new URLSearchParams(params)
    if (m) q.set('cal', m)
    const s = q.toString()
    return s ? `${basePath}?${s}` : basePath
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
          const active = day ? courses.filter((c) => c.starts_at <= day && day <= c.ends_at) : []
          return (
            <div key={i} className={`min-h-20 bg-zinc-950 p-1 ${day === todayStr ? 'bg-zinc-900' : ''}`}>
              {day && (
                <p className={`text-[10px] mb-1 ${day === todayStr ? 'text-pr-red-light font-bold' : 'text-zinc-600'}`}>
                  {Number(day.slice(8))}
                </p>
              )}
              <div className="space-y-0.5">
                {active.map((c) => {
                  const chipClass = `block px-1 py-0.5 rounded border text-[10px] leading-tight truncate ${STATUS_CHIP[c.status] ?? STATUS_CHIP.completed}`
                  const text = day === c.starts_at || i % 7 === 0 ? c.label : '·'
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
    </div>
  )
}
