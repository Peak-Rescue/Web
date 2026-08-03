// Expertise: what an instructor is signed off to run, scoped by sector.
//
// Military and civilian expertise are deliberately separate lists. The same
// terrain appears on both sides — canyon, water, mountain — but the sign-off
// isn't transferable: running Canyon Mobility for a military client is its own
// qualification, distinct from Class C Canyon Rescue.
//
// Sector (military / civilian) lives on the instructor record and says which
// side someone can work at all; these are the skill areas within each side.

export type CapabilityCategory =
  // Civilian
  | 'industry' | 'rope_access' | 'aerial_evac' | 'canyoning'
  | 'swift_water' | 'backcountry'
  // Military
  | 'mil_jungle' | 'mil_urban' | 'mil_mountain' | 'mil_canyon'
  | 'mil_water' | 'mil_maritime' | 'mil_cold_weather' | 'mil_small_team' | 'mil_aerial'

export type CapabilityRole = 'lead' | 'assist'
export type CapabilitySector = 'civilian' | 'military'

export const CAPABILITY_META: Record<CapabilityCategory, { label: string; sector: CapabilitySector }> = {
  // ─── Civilian ─────────────────────────────────────────────────────────────
  // Confined space folded into industry (Aug 2026): every instructor holding
  // it also held industry, so it was a redundant second sign-off.
  industry:         { label: 'Industry',          sector: 'civilian' },
  rope_access:      { label: 'Rope Access',       sector: 'civilian' },
  aerial_evac:      { label: 'Aerial Evac',       sector: 'civilian' },
  canyoning:        { label: 'Canyon',            sector: 'civilian' },
  swift_water:      { label: 'Swift Water',       sector: 'civilian' },
  backcountry:      { label: 'Backcountry',       sector: 'civilian' },
  // ─── Military ─────────────────────────────────────────────────────────────
  // Parachute rescue & recovery sits inside Jungle Mobility.
  mil_jungle:       { label: 'Jungle Mobility',   sector: 'military' },
  mil_urban:        { label: 'Urban Mobility',    sector: 'military' },
  mil_mountain:     { label: 'Mountain Mobility', sector: 'military' },
  mil_canyon:       { label: 'Canyon Mobility',   sector: 'military' },
  mil_water:        { label: 'Water Mobility',    sector: 'military' },
  mil_maritime:     { label: 'Maritime Mobility', sector: 'military' },
  mil_cold_weather: { label: 'Cold Weather',      sector: 'military' },
  mil_small_team:   { label: 'Small Team Rescue', sector: 'military' },
  mil_aerial:       { label: 'Aerial Assets',     sector: 'military' },
}

export const CIVILIAN_CAPABILITIES: CapabilityCategory[] = [
  'industry', 'rope_access', 'aerial_evac', 'canyoning', 'swift_water', 'backcountry',
]

export const MILITARY_CAPABILITIES: CapabilityCategory[] = [
  'mil_jungle', 'mil_urban', 'mil_mountain', 'mil_canyon',
  'mil_water', 'mil_maritime', 'mil_cold_weather', 'mil_small_team', 'mil_aerial',
]

export const CAPABILITY_ORDER: CapabilityCategory[] = [
  ...CIVILIAN_CAPABILITIES,
  ...MILITARY_CAPABILITIES,
]

export function capabilitiesForSector(sector: CapabilitySector): CapabilityCategory[] {
  return sector === 'military' ? MILITARY_CAPABILITIES : CIVILIAN_CAPABILITIES
}

// Which expertise covers each offering. Military offerings map only to
// military expertise and civilian only to civilian — that separation is the
// point: the tactical version of a discipline is its own sign-off.
export const CATEGORY_COURSE_TYPES: Record<CapabilityCategory, string[]> = {
  // Civilian
  industry:         ['emergency-response-team', 'firefighter-survival', 'fall-protection-rope-access', 'rope-rescue', 'standby-rescue', 'tv-rigging-safety', 'confined-space-rescue'],
  rope_access:      ['rope-rescue', 'fall-protection-rope-access'],
  aerial_evac:      ['aerial-tramway-rescue', 'zipline-adventure-park-rescue', 'stableflight'],
  canyoning:        ['class-c-canyon-rescue'],
  swift_water:      ['swiftwater-rescue'],
  backcountry:      ['mountain-rescue'],
  // Military
  mil_jungle:       ['jungle-mobility'],
  mil_urban:        ['urban-mobility'],
  mil_mountain:     ['mountain-mobility-training'],
  mil_canyon:       ['canyoneering'],
  mil_water:        ['water-mobility'],
  mil_maritime:     ['maritime-mobility'],
  mil_cold_weather: ['cold-weather-arctic-operations'],
  mil_small_team:   ['small-team-rescue'],
  mil_aerial:       ['aerial-assets'],
}

// Expertise that covers a course instance — the reverse of the map above.
// Custom courses have no type slug, so they use the categories the admin
// tagged them with (course_instances.custom_categories).
export function courseCapabilityCategories(
  course_type: string,
  custom_categories: string[] | null | undefined,
): CapabilityCategory[] {
  if (course_type === 'custom') {
    return (custom_categories ?? []).filter((c): c is CapabilityCategory => c in CATEGORY_COURSE_TYPES)
  }
  return CAPABILITY_ORDER.filter((cat) => CATEGORY_COURSE_TYPES[cat].includes(course_type))
}
