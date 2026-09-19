import { describe, it, expect } from 'vitest'
import { groupItemsByCourse } from '@/lib/expenses'

const CANYON = 'canyon-id'
const SHIP = 'ship-id'
const LABELS: Record<string, string> = {
  [CANYON]: 'PR-13 · Canyoneering · 24 STS',
  [SHIP]: 'PR-53 · Ships and containers · MSRT-East',
}
const labelFor = (id: string) => LABELS[id]

function item(over: Partial<Parameters<typeof groupItemsByCourse>[0][number]> & { start_date: string; amount: number }) {
  return { instance_id: null, non_course: false, ...over }
}

describe('groupItemsByCourse', () => {
  it('reads the report default as the course for lines that name none', () => {
    const groups = groupItemsByCourse(
      [item({ start_date: '2026-09-13', amount: 79.95 }), item({ start_date: '2026-09-18', amount: 50 })],
      CANYON,
      labelFor
    )
    expect(groups).toHaveLength(1)
    expect(groups[0].instanceId).toBe(CANYON)
    expect(groups[0].label).toBe(LABELS[CANYON])
    expect(groups[0].total).toBe(129.95)
  })

  it('splits a line that names its own course away from the default', () => {
    const groups = groupItemsByCourse(
      [
        item({ start_date: '2026-09-13', amount: 870.8 }),
        item({ start_date: '2026-09-20', amount: 390.4, instance_id: SHIP }),
        item({ start_date: '2026-09-26', amount: 278.2, instance_id: SHIP }),
      ],
      CANYON,
      labelFor
    )
    expect(groups.map((g) => [g.label, g.total])).toEqual([
      [LABELS[CANYON], 870.8],
      [LABELS[SHIP], 668.6],
    ])
  })

  it('orders courses by their earliest line, whatever order the lines arrive in', () => {
    const groups = groupItemsByCourse(
      [
        item({ start_date: '2026-09-20', amount: 10, instance_id: SHIP }),
        item({ start_date: '2026-09-13', amount: 10, instance_id: CANYON }),
      ],
      null,
      labelFor
    )
    expect(groups.map((g) => g.instanceId)).toEqual([CANYON, SHIP])
  })

  it('puts overhead after the courses and the unanswered lines last', () => {
    const groups = groupItemsByCourse(
      [
        item({ start_date: '2026-09-30', amount: 10 }),
        item({ start_date: '2026-09-01', amount: 10, non_course: true }),
        item({ start_date: '2026-09-20', amount: 10, instance_id: SHIP }),
      ],
      null,
      labelFor
    )
    expect(groups.map((g) => g.key)).toEqual([SHIP, 'overhead', 'unclassified'])
    expect(groups.map((g) => g.label)).toEqual([LABELS[SHIP], 'Overhead', 'No course yet'])
  })

  it('keeps overhead out of a course even when the report has a default', () => {
    const groups = groupItemsByCourse(
      [item({ start_date: '2026-09-13', amount: 10, non_course: true })],
      CANYON,
      labelFor
    )
    expect(groups.map((g) => g.key)).toEqual(['overhead'])
  })

  it('names a course it has no label for rather than dropping the group', () => {
    const groups = groupItemsByCourse(
      [item({ start_date: '2026-09-13', amount: 10, instance_id: 'gone' })],
      null,
      labelFor
    )
    expect(groups[0].label).toBe('Another course')
  })

  it('rounds a subtotal the way the report total is rounded', () => {
    const groups = groupItemsByCourse(
      [item({ start_date: '2026-09-13', amount: 0.1 }), item({ start_date: '2026-09-14', amount: 0.2 })],
      CANYON,
      labelFor
    )
    expect(groups[0].total).toBe(0.3)
  })

  it('comes back empty for a report with no lines', () => {
    expect(groupItemsByCourse([], CANYON, labelFor)).toEqual([])
  })
})
