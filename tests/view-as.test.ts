import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { normalizeViewAs, viewAsChoices, viewAsSelf, type ViewAs } from '@/lib/view-as-roles'

// View-as hands nobody a role they don't have.
//
// It started as an admin-only control and now an instructor has it too, which
// makes the question "who may read as whom" worth pinning down rather than
// re-deriving at each of the six pages that asks. The rule is one function; the
// first half of this file is its truth table, and the second half reads the
// call sites, because the rule being right is worth nothing if a page asks it
// the wrong question.
//
// What is NOT covered here, and still has to be checked by hand: that a
// preview only ever *subtracts* from a page. These tests can say an instructor
// may only ever ask for 'student'; they cannot say that the student view of a
// course omits the internal curriculum rows.

const ROLES = ['admin', 'instructor', 'student', null, undefined, '', 'Admin', 'ADMIN', 'owner', 'instructors']

describe('viewAsChoices', () => {
  it('lets an admin read as either role below them', () => {
    expect(viewAsChoices('admin')).toEqual(['instructor', 'student'])
  })

  it('lets an instructor read as a student, and nothing else', () => {
    expect(viewAsChoices('instructor')).toEqual(['student'])
  })

  it('offers a student nothing — there is nobody below them', () => {
    expect(viewAsChoices('student')).toEqual([])
  })

  it('offers nothing to a role it does not recognise, however near-miss', () => {
    for (const role of [null, undefined, '', 'Admin', 'ADMIN', 'owner', 'instructors', 'admin ']) {
      expect(viewAsChoices(role)).toEqual([])
    }
  })

  it('never offers admin to anyone, including an admin', () => {
    // The top of the ladder is not a rung you can step onto: there is no
    // 'admin' preview, so no cookie value can ever ask to be read as one.
    for (const role of ROLES) {
      expect(viewAsChoices(role)).not.toContain('admin' as unknown as ViewAs)
    }
  })

  it('never offers anyone their own role or above', () => {
    const rank = { student: 0, instructor: 1, admin: 2 } as const
    for (const role of ['admin', 'instructor', 'student'] as const) {
      for (const choice of viewAsChoices(role)) {
        expect(rank[choice]).toBeLessThan(rank[role])
      }
    }
  })
})

describe('normalizeViewAs', () => {
  it('accepts only the two preview roles', () => {
    expect(normalizeViewAs('instructor')).toBe('instructor')
    expect(normalizeViewAs('student')).toBe('student')
  })

  it('rejects anything else a cookie could be hand-set to', () => {
    for (const v of ['admin', 'Student', 'STUDENT', '', ' student', 'student,admin', null, undefined]) {
      expect(normalizeViewAs(v)).toBeNull()
    }
  })
})

describe('viewAsSelf', () => {
  it('names the two roles that get the chip', () => {
    expect(viewAsSelf('admin')).toBe('admin')
    expect(viewAsSelf('instructor')).toBe('instructor')
  })

  it('is null for everyone who has no preview to enter', () => {
    for (const role of ['student', null, undefined, '', 'owner']) {
      expect(viewAsSelf(role)).toBeNull()
    }
  })

  it('agrees with viewAsChoices about who has previews', () => {
    for (const role of ROLES) {
      expect(viewAsSelf(role) !== null).toBe(viewAsChoices(role).length > 0)
    }
  })
})

// --- The call sites ---------------------------------------------------------
//
// readViewAs used to take an `isAdmin` boolean. It takes the real role now, and
// the two are the same shape at a call site: `readViewAs(isAdmin)` still
// compiles, still returns null forever, and the preview silently stops working
// for everyone with no error anywhere. So the argument is checked here.

function read(p: string): string {
  return fs.readFileSync(path.join(process.cwd(), p), 'utf8')
}

function sourceFiles(): string[] {
  const out: string[] = []
  const walk = (dir: string) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name)
      if (e.isDirectory()) walk(full)
      else if (/\.tsx?$/.test(e.name)) out.push(full)
    }
  }
  for (const root of ['app', 'components', 'lib']) walk(path.join(process.cwd(), root))
  return out
}

describe('every page asks the rule the right question', () => {
  const calls = sourceFiles()
    .flatMap((file) => {
      const src = fs.readFileSync(file, 'utf8')
      return [...src.matchAll(/readViewAs\(([^)]*)\)/g)].map((m) => ({
        file: path.relative(process.cwd(), file),
        arg: m[1].trim(),
      }))
    })
    .filter((c) => !c.file.startsWith('lib/view-as'))

  it('finds the call sites at all', () => {
    expect(calls.length).toBeGreaterThanOrEqual(5)
  })

  it('passes a role, never a boolean', () => {
    for (const { file, arg } of calls) {
      expect(`${file}: readViewAs(${arg})`).toMatch(/role/)
    }
  })
})

describe('only the route handler writes the cookie, and only through the rule', () => {
  const route = read('app/api/view-as/route.ts')

  it('gates the write on viewAsChoices', () => {
    expect(route).toMatch(/viewAsChoices\(profile\?\.role\)\.includes\(role\)/)
  })

  it('clears the cookie on any other outcome, rather than leaving a stale one', () => {
    expect(route).toMatch(/else\s*\{\s*\n\s*res\.cookies\.delete/)
  })

  it('is the only place in the app that sets the cookie', () => {
    const setters = sourceFiles().filter((file) => {
      const src = fs.readFileSync(file, 'utf8')
      return /cookies\(\)\.set|cookies\.set\(\s*VIEW_AS_COOKIE|cookies\.set\(\s*'view_as'/.test(src)
        && /VIEW_AS_COOKIE|view_as/.test(src)
    })
    expect(setters.map((f) => path.relative(process.cwd(), f))).toEqual(['app/api/view-as/route.ts'])
  })
})
