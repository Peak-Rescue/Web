import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

// The gate is a filter on a query, not a function anyone can call — so what is
// worth testing is that no read path which can reach a non-admin has been left
// without it. A missed `.eq('admin_only', false)` is silent: the page renders,
// the item is simply there for someone who should not see it.
const read = (p: string) => readFileSync(p, 'utf8')

describe('admin-only material', () => {
  it('is never offered to a course by any of the three pickers', () => {
    const picker = read('app/admin/courses/actions.ts')
    const resources = read('app/admin/courses/resource-actions.ts')
    const maps = read('app/admin/courses/map-actions.ts')
    for (const [name, src] of [['curriculum', picker], ['resources', resources], ['maps', maps]] as const) {
      expect(src, `${name} picker must exclude admin-only material`).toContain("admin_only', false")
    }
  })

  it('is filtered out of the library list for anyone who is not an admin', () => {
    const page = read('app/admin/library/page.tsx')
    expect(page).toContain("if (!isAdmin) query = query.eq('admin_only', false)")
  })

  it('cannot be marked admin-only and student-visible at once', () => {
    const actions = read('app/admin/library/actions.ts')
    // The flag adds a restriction on top of the audience ladder, so the rung
    // underneath has to be the restrictive one.
    expect(actions).toContain("if (patch.admin_only) update.audience = 'internal'")
  })
})

describe('adding a library item to a course', () => {
  it('accepts the same shelves the picker offers', () => {
    // The picker read Reference and Documents; the add read Reference alone,
    // so a venue's med plan could be ticked and then silently not added.
    //
    // Compared rather than spelled out, because the list has grown twice
    // since — Documents for the plans, Instructor material for the debriefs
    // — and each time the literal in this test was the thing that noticed,
    // which is a test about its own wording rather than about the rule.
    const src = readFileSync('app/admin/courses/resource-actions.ts', 'utf8')
    const bucketsIn = (fn: string) => {
      const body = src.slice(src.indexOf(`export async function ${fn}`))
      return /\.in\('bucket', (\[[^\]]*\])\)/.exec(body)?.[1]
    }
    const offered = bucketsIn('loadResourceLibrary')
    expect(offered).toBeTruthy()
    expect(bucketsIn('addCourseResourcesFromLibrary')).toBe(offered)

    const add = src.slice(src.indexOf('export async function addCourseResourcesFromLibrary'))
    expect(add).toContain("admin_only', false")
  })
})
