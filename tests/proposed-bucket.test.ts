import { describe, expect, it } from 'vitest'
import { proposedBucket } from '@/lib/library'

const item = (over: Partial<Parameters<typeof proposedBucket>[0]>) => ({
  kind: 'reference',
  bucket: 'instructor' as const,
  title: 'Something',
  source_topic: null,
  ...over,
})

describe('proposedBucket', () => {
  it('files paperwork by what it is, whatever room it came from', () => {
    expect(proposedBucket(item({ kind: 'permit', source_topic: 'Canyon Course — Taiwan' }))).toBe('documents')
    expect(proposedBucket(item({ kind: 'form' }))).toBe('documents')
    expect(proposedBucket(item({ kind: 'rescue_plan' }))).toBe('documents')
  })

  it('never moves a map off the map shelf', () => {
    expect(proposedBucket(item({ kind: 'map', bucket: 'map' }))).toBe('map')
  })

  it('sorts the teaching kinds apart from the reference ones', () => {
    expect(proposedBucket(item({ kind: 'presentation' }))).toBe('teaching')
    expect(proposedBucket(item({ kind: 'skill_sheet' }))).toBe('teaching')
    expect(proposedBucket(item({ kind: 'standard' }))).toBe('resource')
    expect(proposedBucket(item({ kind: 'manual' }))).toBe('resource')
    expect(proposedBucket(item({ kind: 'outline' }))).toBe('instructor')
  })

  it('reads the title before the room, for the catch-all kind', () => {
    expect(proposedBucket(item({ title: 'Peak Rescue logo white.png' }))).toBe('documents')
    expect(proposedBucket(item({ title: 'Employee Handbook 2026' }))).toBe('documents')
    expect(proposedBucket(item({ title: 'Worker incident form' }))).toBe('documents')
  })

  it('falls back to the Classroom topic, stripping the shouty prefix', () => {
    expect(proposedBucket(item({ source_topic: '📄Peak Documents (DO NOT POST)' }))).toBe('documents')
    expect(proposedBucket(item({ source_topic: '📗Standards Topics' }))).toBe('resource')
    expect(proposedBucket(item({ source_topic: 'Class Notes' }))).toBe('instructor')
  })

  it('says nothing rather than guessing', () => {
    // A wrong guess accepted in bulk is worse than no guess: nobody re-checks
    // a shelf that already looks sorted.
    expect(proposedBucket(item({ title: 'Rappel Systems', source_topic: 'Canyon Course — Taiwan' }))).toBeNull()
    expect(proposedBucket(item({ kind: 'video' }))).toBeNull()
    expect(proposedBucket(item({ kind: 'media' }))).toBeNull()
  })
})

describe('proposedBucket — the exceptions worth writing down', () => {
  it('keeps pre-course material with the teaching, not the paperwork', () => {
    // Posted in the scheduling room and called a survey; it is still the thing
    // a student is handed before the course.
    expect(
      proposedBucket(item({ title: 'Peak Rescue - Canyon Rescue Pre-Course Survey', source_topic: '✏Class Scheduling/Sign UP' }))
    ).toBe('teaching')
  })
})

describe('bucketForKind', () => {
  it('reads the shelf off the group the type is listed under', async () => {
    const { bucketForKind } = await import('@/lib/library')
    expect(bucketForKind('permit')).toBe('documents')
    expect(bucketForKind('standard')).toBe('resource')
    expect(bucketForKind('skill_sheet')).toBe('teaching')
    expect(bucketForKind('outline')).toBe('instructor')
    expect(bucketForKind('map')).toBe('map')
  })

  it('says nothing for the types whose card is not a shelf', async () => {
    const { bucketForKind } = await import('@/lib/library')
    // A photo album is read from the media card and the untyped catch-all has
    // not said anything yet; neither should drag a row onto a shelf.
    expect(bucketForKind('media')).toBeNull()
    expect(bucketForKind('reference')).toBeNull()
  })
})
