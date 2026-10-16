import { describe, expect, it } from 'vitest'
import { classify, changesFor, type SortableItem } from '@/lib/sorting'

const item = (o: Partial<SortableItem> = {}): SortableItem => ({
  title: 'Something', url: null, kind: 'reference', bucket: 'instructor', source_topic: null, ...o,
})

describe('what it will file without asking', () => {
  it('reads the link before the name', () => {
    const v = classify(item({ title: 'Convert ATC Block to Raise/Lower', url: 'https://www.youtube.com/watch?v=x' }))
    expect(v).toMatchObject({ confident: true, kind: 'video' })
  })

  it('knows paperwork by name', () => {
    expect(classify(item({ title: 'Course Waiver' }))).toMatchObject({ confident: true, kind: 'form', bucket: 'documents' })
    expect(classify(item({ title: 'Logos' }))).toMatchObject({ confident: true, bucket: 'documents' })
    expect(classify(item({ title: 'Company Evac Plans' }))).toMatchObject({ confident: true, kind: 'rescue_plan' })
  })

  it('locks a permit down wherever it is', () => {
    expect(classify(item({ title: '2026 Permits' }))).toMatchObject({ confident: true, adminOnly: true })
    expect(classify(item({ title: 'Elevated Safety MOU' }))).toMatchObject({ confident: true, adminOnly: true })
  })
})

describe('what it refuses, and why that is the point', () => {
  it('leaves alone anything already used on a course', () => {
    const v = classify(item({ title: 'Course Waiver', used: true }))
    expect(v.confident).toBe(false)
    expect(v.reason).toContain('already used')
  })

  it('still locks down a permit that is in use — that one runs the other way', () => {
    expect(classify(item({ title: '2026 Permits', used: true }))).toMatchObject({ confident: true, adminOnly: true })
  })

  it('will not turn a map link into a map, because a map needs a place', () => {
    const v = classify(item({ title: 'Zion Area', url: 'https://caltopo.com/m/ABC' }))
    expect(v.confident).toBe(false)
    expect(v.reason).toContain('needs a place')
  })

  it('admits when a Drive link tells it nothing', () => {
    const v = classify(item({ title: 'Company Information', url: 'https://drive.google.com/drive/folders/x' }))
    expect(v.confident).toBe(false)
  })
})

describe('changesFor', () => {
  it('drops the half that already agrees', () => {
    const i = item({ kind: 'form', bucket: 'documents' })
    expect(changesFor(i, { kind: 'form', bucket: 'documents', reason: '' })).toEqual({})
  })
  it('keeps only what actually moves', () => {
    const i = item({ kind: 'reference', bucket: 'instructor' })
    expect(changesFor(i, { kind: 'form', bucket: 'documents', reason: '' })).toEqual({ kind: 'form', bucket: 'documents' })
  })
})

describe('changesFor — admin-only is compared too', () => {
  it('does not report locking down something already locked down', () => {
    // Left uncompared, every re-run reported the same seven permits as
    // outstanding, which made a finished pass look unfinished.
    const locked = item({ title: '2026 Permits', admin_only: true })
    expect(changesFor(locked, { adminOnly: true, reason: '' })).toEqual({})
  })
})

describe('shelfLink', () => {
  it('names a shelf from the same table the card is drawn from', async () => {
    const { shelfLink } = await import('@/lib/library')
    expect(shelfLink('venue')).toEqual({ href: '/admin/library?bucket=venue', label: 'Venue information' })
    expect(shelfLink('resource').label).toBe('Reference')
  })

  it('carries extra params without anyone writing the query by hand', async () => {
    const { shelfLink } = await import('@/lib/library')
    expect(shelfLink('resource', { status: 'all' }).href).toBe('/admin/library?bucket=resource&status=all')
  })
})
