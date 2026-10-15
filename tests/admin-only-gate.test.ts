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
