'use client'

import { createContext, useContext, useState } from 'react'

// The course page serves four unrelated jobs — planning, staffing, money,
// delivery — and you open it to do one of them. One long scroll made it easy
// to lose which section you were in; a divider wasn't enough, so each section
// is now a tab and only one is on screen.
//
// Panels stay mounted and are hidden rather than unmounted: the forms in them
// auto-save on a debounce, and unmounting mid-edit would drop the last change.

const TabContext = createContext<string>('')

export type CourseTab = { id: string; label: string; badge?: number }

export function CourseTabs({
  tabs,
  storageKey,
  children,
}: {
  tabs: CourseTab[]
  storageKey: string
  children: React.ReactNode
}) {
  // Come back to the tab you were last on — you usually return to a course for
  // the same reason you left it. Read during the initial state computation so
  // there's no post-mount setState (and no flash of the wrong tab).
  const [active, setActive] = useState<string>(() => {
    if (typeof window === 'undefined') return tabs[0]?.id ?? ''
    const stored = window.localStorage.getItem(storageKey)
    return stored && tabs.some((t) => t.id === stored) ? stored : tabs[0]?.id ?? ''
  })

  function pick(id: string) {
    setActive(id)
    localStorage.setItem(storageKey, id)
  }

  return (
    <TabContext.Provider value={active}>
      <div className="sticky top-16 md:top-20 z-30 -mx-4 px-4 py-2 sm:py-0 bg-zinc-950/95 backdrop-blur border-b border-zinc-800 mb-8">
        {/* On a phone the tabs scroll rather than hide behind a picker. The
            native select showed them all in a tap, but it also meant a tap to
            find out what the page even contains — and the course page carries
            the same scrolling bar, so the two screens now read alike. */}
        <nav className="sm:hidden flex gap-1 overflow-x-auto no-scrollbar -mx-1 px-1">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => pick(t.id)}
              className={`shrink-0 inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full border transition-colors ${
                active === t.id
                  ? 'border-pr-red bg-pr-red/15 text-white'
                  : 'border-transparent text-zinc-500 hover:text-zinc-200 hover:bg-zinc-900'
              }`}
            >
              {t.label}
              {t.badge !== undefined && t.badge > 0 && (
                <span className="text-[10px] text-zinc-600">{t.badge}</span>
              )}
            </button>
          ))}
        </nav>

        <nav className="hidden sm:flex gap-1 overflow-x-auto">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => pick(t.id)}
              className={`px-3 py-2.5 text-sm whitespace-nowrap border-b-2 -mb-px transition-colors ${
                active === t.id
                  ? 'border-pr-red text-white font-medium'
                  : 'border-transparent text-zinc-500 hover:text-zinc-300'
              }`}
            >
              {t.label}
              {t.badge !== undefined && t.badge > 0 && (
                <span className="ml-1.5 text-[10px] text-zinc-600">{t.badge}</span>
              )}
            </button>
          ))}
        </nav>
      </div>
      {children}
    </TabContext.Provider>
  )
}

export function TabPanel({ id, children }: { id: string; children: React.ReactNode }) {
  const active = useContext(TabContext)
  return (
    <section id={id} hidden={active !== id}>
      {children}
    </section>
  )
}
