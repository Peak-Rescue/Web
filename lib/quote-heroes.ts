import { services, categoryMeta } from '@/lib/data/services'

// categories drive the picker's filter tabs — same keys the gallery filters
// by; an empty list means the photo only shows under "All".
export type HeroChoice = { value: string; label: string; categories: string[] }

function dedupe(list: HeroChoice[]): HeroChoice[] {
  const seen = new Set<string>()
  return list.filter((c) => (seen.has(c.value) ? false : (seen.add(c.value), true)))
}

// The photo pool an admin can pin as a course's quote-page hero: standalone
// topic shots first, then every service hero, then the category banners.
// Gallery uploads join this pool at render time (see the course admin page).
export const HERO_CHOICES: HeroChoice[] = dedupe([
  { value: '/images/swiftwater-rescue.jpg', label: 'Swiftwater — canyon entry', categories: ['sar'] },
  { value: '/images/swiftwater-team.jpg', label: 'Swiftwater — team in rapids', categories: ['sar'] },
  { value: '/images/swiftwater-river.jpg', label: 'Swiftwater — river crossing', categories: ['sar'] },
  { value: '/images/maritime-swim.jpg', label: 'Maritime swim', categories: ['tactical'] },
  { value: '/images/tactical-rope.jpg', label: 'Tactical rope', categories: ['tactical'] },
  { value: '/images/hero-scene.jpg', label: 'Mountain scene', categories: [] },
  { value: '/images/pr_hero.jpeg', label: 'Peak Rescue hero', categories: [] },
  ...services
    .filter((s): s is typeof s & { heroImage: string } => Boolean(s.heroImage))
    .map((s) => ({ value: s.heroImage, label: s.title, categories: [s.category] })),
  ...Object.entries(categoryMeta).map(([key, m]) => ({ value: m.image, label: `${m.label} (category)`, categories: [key] })),
])
