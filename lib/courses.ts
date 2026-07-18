import { services, categoryMeta, type ServiceCategory } from './data/services'

export type DateBlock = { starts_at: string; ends_at: string }
export type OffDayRange = { off_date: string; end_date?: string | null }

export function computeBlocks(starts_at: string, ends_at: string, offDays: OffDayRange[]): DateBlock[] {
  // Build a set of all individual off dates, expanding ranges
  const offSet = new Set<string>()
  for (const { off_date, end_date } of offDays) {
    const rangeEnd = end_date ?? off_date
    const d = new Date(off_date + 'T00:00:00')
    const e = new Date(rangeEnd + 'T00:00:00')
    while (d <= e) {
      offSet.add(d.toISOString().slice(0, 10))
      d.setDate(d.getDate() + 1)
    }
  }

  const blocks: DateBlock[] = []
  const end = new Date(ends_at + 'T00:00:00')
  let blockStart: string | null = null
  let blockEnd: string | null = null

  const d = new Date(starts_at + 'T00:00:00')
  while (d <= end) {
    const dateStr = d.toISOString().slice(0, 10)
    if (!offSet.has(dateStr)) {
      if (!blockStart) blockStart = dateStr
      blockEnd = dateStr
    } else if (blockStart && blockEnd) {
      blocks.push({ starts_at: blockStart, ends_at: blockEnd })
      blockStart = null
      blockEnd = null
    }
    d.setDate(d.getDate() + 1)
  }

  if (blockStart && blockEnd) blocks.push({ starts_at: blockStart, ends_at: blockEnd })
  return blocks
}

export { categoryMeta }

export const COURSE_TYPE_OPTIONS = [
  ...(['tactical', 'sar', 'industrial', 'specialty'] as ServiceCategory[]).map(cat => ({
    category: cat,
    label: categoryMeta[cat].label,
    options: services
      .filter(s => s.category === cat)
      .map(s => ({ value: s.slug, label: s.shortTitle })),
  })),
]

export function courseDisplayName(course_type: string, custom_title: string | null): string {
  if (course_type === 'custom') return custom_title ?? 'Custom Course'
  return services.find(s => s.slug === course_type)?.title ?? custom_title ?? course_type
}

export function courseShortName(course_type: string, custom_title: string | null): string {
  if (course_type === 'custom') return custom_title ?? 'Custom Course'
  return services.find(s => s.slug === course_type)?.shortTitle ?? custom_title ?? course_type
}

// Compact display label for a course instance — the human parts (type,
// client, location, date) lead; the PR ref number trails for uniqueness.
// e.g. "Jungle Mobility · Peak Rescue · Casper · Jul 2026 (PR-0002)"
export type InstanceLabelFields = {
  ref_number: number
  course_type: string
  custom_title: string | null
  client_name: string | null
  location: string | null
  starts_at: string | null
}

export function instanceLabel(i: InstanceLabelFields): string {
  const parts = [
    courseShortName(i.course_type, i.custom_title),
    i.client_name,
    i.location,
    i.starts_at
      ? new Date(i.starts_at + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
      : null,
  ].filter(Boolean)
  return `${parts.join(' · ')} (PR-${String(i.ref_number).padStart(4, '0')})`
}
