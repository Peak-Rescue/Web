import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

// One day card, two screens, and for months one of them quietly had less on it.
//
// The move-earlier/move-later arrows live in ScheduleDayCard. They used to be
// offered through a pair of optional booleans, so the screen that laid the days
// out in order — the full editor, and through it every schedule template on the
// shelf — passed neither, showed no arrows, and nothing anywhere said a feature
// was missing. A template's day order could not be changed after it was built.
//
// The props are required now, which is the real guard: the build fails at a
// call site that says nothing. This is the guard on the guard — it fails if
// someone makes them optional again, and it reads every call site rather than
// trusting that the two known ones are all there are.

const ROOTS = ['app', 'components', 'lib']

function sourceFiles(): string[] {
  const out: string[] = []
  const walk = (dir: string) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name)
      if (e.isDirectory()) walk(p)
      else if (e.name.endsWith('.tsx') || e.name.endsWith('.ts')) out.push(p)
    }
  }
  for (const r of ROOTS) walk(r)
  return out
}

/** Every `<Component …>` opening tag in a file, up to the `>` that ends it. */
function openingTags(src: string, component: string): string[] {
  const tags: string[] = []
  const needle = `<${component}`
  let at = src.indexOf(needle)
  while (at !== -1) {
    // Not a prefix match on a longer component name.
    if (!/[A-Za-z0-9_]/.test(src[at + needle.length] ?? '')) {
      const end = src.indexOf('>', at)
      tags.push(src.slice(at, end === -1 ? undefined : end))
    }
    at = src.indexOf(needle, at + 1)
  }
  return tags
}

function callSites(component: string): { file: string; tag: string }[] {
  return sourceFiles()
    .filter((f) => !f.endsWith(`${component}.tsx`))
    .flatMap((f) => openingTags(fs.readFileSync(f, 'utf8'), component).map((tag) => ({ file: f, tag })))
}

describe('ScheduleDayCard', () => {
  const card = fs.readFileSync('app/admin/schedules/ScheduleDayCard.tsx', 'utf8')

  it('requires the day to say where it sits', () => {
    expect(card).toMatch(/^\s*order: \{ isFirst: boolean; isLast: boolean \} \| 'unordered'$/m)
    // The two booleans this replaced, in the shape that let a caller stay quiet.
    expect(card).not.toMatch(/isFirst\?:/)
    expect(card).not.toMatch(/isLast\?:/)
  })

  it('is rendered nowhere without one', () => {
    const sites = callSites('ScheduleDayCard')
    expect(sites.length).toBeGreaterThan(1)
    for (const { file, tag } of sites) {
      expect(tag, `${file} renders a day card without saying where the day sits`).toMatch(/\border=/)
    }
  })
})

describe('ScheduleEditor', () => {
  const editor = fs.readFileSync('app/admin/schedules/ScheduleEditor.tsx', 'utf8')

  it('makes every screen say whether the shelf is writable from it', () => {
    // It defaulted to true, so a screen that never thought about the shelf
    // handed it out — the permissive answer is the one a default must never be.
    expect(editor).toMatch(/^\s*canTemplate: boolean$/m)
    expect(editor).not.toMatch(/canTemplate\?:/)
    expect(editor).not.toMatch(/canTemplate = true/)
  })

  it('is rendered nowhere without an answer', () => {
    const sites = callSites('ScheduleEditor')
    expect(sites.length).toBeGreaterThan(0)
    for (const { file, tag } of sites) {
      expect(tag, `${file} renders the schedule editor without answering canTemplate`).toMatch(/\bcanTemplate\b/)
    }
  })
})
