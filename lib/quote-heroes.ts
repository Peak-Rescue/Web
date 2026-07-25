import { services, categoryMeta } from '@/lib/data/services'

export type HeroChoice = { value: string; label: string }

function dedupe(list: HeroChoice[]): HeroChoice[] {
  const seen = new Set<string>()
  return list.filter((c) => (seen.has(c.value) ? false : (seen.add(c.value), true)))
}

// The photo pool an admin can pin as a course's quote-page hero: standalone
// topic shots first, then every service hero, then the category banners.
export const HERO_CHOICES: HeroChoice[] = dedupe([
  { value: '/images/swiftwater-rescue.jpg', label: 'Swiftwater — canyon entry' },
  { value: '/images/swiftwater-team.jpg', label: 'Swiftwater — team in rapids' },
  { value: '/images/swiftwater-river.jpg', label: 'Swiftwater — river crossing' },
  { value: '/images/maritime-swim.jpg', label: 'Maritime swim' },
  { value: '/images/tactical-rope.jpg', label: 'Tactical rope' },
  { value: '/images/hero-scene.jpg', label: 'Mountain scene' },
  { value: '/images/pr_hero.jpeg', label: 'Peak Rescue hero' },
  ...services
    .filter((s): s is typeof s & { heroImage: string } => Boolean(s.heroImage))
    .map((s) => ({ value: s.heroImage, label: s.title })),
  ...Object.values(categoryMeta).map((m) => ({ value: m.image, label: `${m.label} (category)` })),
])
