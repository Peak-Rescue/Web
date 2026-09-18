import { type Step } from '@/lib/course-readiness'

// What a course needs from you, as a thing you can filter and count by.
//
// Every one of these asks the same step list the row draws, so a filter can
// never disagree with what is on screen and a count at the top of the page can
// never disagree with the rows under it. That is the whole reason they live
// here rather than being written twice.

export type NeedId =
  | 'staffing' | 'quote' | 'billing' | 'books'
  | 'build' | 'waiting' | 'clear'

export type Need = {
  id: NeedId
  /** On the filter chip. */
  label: string
  test: (steps: Step[]) => boolean
}

const acts = (steps: Step[], key: Step['key']) =>
  steps.some((s) => s.key === key && s.tone === 'action')

export const NEEDS: Need[] = [
  { id: 'staffing', label: 'Needs staffing', test: (s) => acts(s, 'staffing') },
  { id: 'quote', label: 'Quote to send', test: (s) => acts(s, 'quote') },
  { id: 'billing', label: 'Needs billing', test: (s) => acts(s, 'billing') },
  { id: 'books', label: 'Books to close', test: (s) => acts(s, 'books') },
  { id: 'build', label: 'Nothing built', test: (s) => s.some((x) => x.track === 'build' && x.tone === 'idle') },
  // Nothing for you to do, but somebody owes you an answer. Worth being able
  // to ask for separately: it is the list you chase from, not the list you
  // work from.
  { id: 'waiting', label: 'Waiting on someone', test: (s) => !s.some((x) => x.tone === 'action') && s.some((x) => x.tone === 'waiting') },
  { id: 'clear', label: 'All clear', test: (s) => s.length > 0 && !s.some((x) => x.tone === 'action' || x.tone === 'waiting') },
]

export const needById = (id: NeedId) => NEEDS.find((n) => n.id === id)!

/** Check-all-that-apply, like every other filter on this page: the picks OR
    together, and the whole set ANDs against the rest of the filter bar. */
export const matchesNeeds = (steps: Step[], picked: Set<string>) =>
  picked.size === 0 || [...picked].some((id) => needById(id as NeedId).test(steps))
