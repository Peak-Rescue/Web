// Expertise: the skill an instructor is signed off in, at lead or assist.
//
// One list, not one per sector. The skills genuinely overlap — swiftwater is
// swiftwater whether the team is civilian or military — and in practice the
// same people work both sides. What differs is whether someone is cleared to
// work that client type, which is a separate field on the instructor record
// (instructors.sectors). Staffing requires both: the right skill AND clearance
// for the sector.
//
// The hyper-specific differences between, say, a civilian and a military
// swiftwater course are differences in delivery and material, not in who can
// teach it — so they live on the offering and its content, not here.
//
// Four skills have no civilian counterpart (jungle, urban, cold weather, small
// team) and one has no military one (maritime), but they sit in the same list;
// the sector gate does the filtering.

export type CapabilityCategory =
  | 'industry' | 'rope_access' | 'aerial_evac' | 'canyoning'
  | 'swift_water' | 'backcountry' | 'maritime'
  | 'jungle_mobility' | 'urban_mobility' | 'cold_weather' | 'small_team'

export type CapabilityRole = 'lead' | 'assist'

export const CAPABILITY_META: Record<CapabilityCategory, { label: string }> = {
  // Confined space folded into industry (Aug 2026): every instructor holding
  // it also held industry, so it was a redundant second sign-off.
  industry:        { label: 'Industry' },
  rope_access:     { label: 'Rope Access' },
  aerial_evac:     { label: 'Aerial Evac' },
  canyoning:       { label: 'Canyon' },
  swift_water:     { label: 'Swift Water' },
  backcountry:     { label: 'Backcountry' },
  maritime:        { label: 'Maritime' },
  // Parachute rescue & recovery sits inside jungle mobility.
  jungle_mobility: { label: 'Jungle Mobility' },
  urban_mobility:  { label: 'Urban Mobility' },
  cold_weather:    { label: 'Cold Weather / Arctic' },
  small_team:      { label: 'Small Team Rescue' },
}

export const CAPABILITY_ORDER: CapabilityCategory[] = [
  'industry', 'rope_access', 'aerial_evac', 'canyoning',
  'swift_water', 'backcountry', 'maritime',
  'jungle_mobility', 'urban_mobility', 'cold_weather', 'small_team',
]

// Which expertise covers each offering. Civilian and military versions of the
// same terrain map to the same skill — Canyon Mobility and Class C Canyon
// Rescue both need Canyon — because the sector gate handles the rest.
export const CATEGORY_COURSE_TYPES: Record<CapabilityCategory, string[]> = {
  industry:        ['emergency-response-team', 'firefighter-survival', 'fall-protection-rope-access', 'rope-rescue', 'standby-rescue', 'tv-rigging-safety', 'confined-space-rescue'],
  rope_access:     ['rope-rescue', 'fall-protection-rope-access'],
  aerial_evac:     ['aerial-tramway-rescue', 'zipline-adventure-park-rescue', 'stableflight', 'aerial-assets'],
  canyoning:       ['class-c-canyon-rescue', 'canyoneering'],
  swift_water:     ['swiftwater-rescue', 'water-mobility'],
  backcountry:     ['mountain-rescue', 'mountain-mobility-training'],
  maritime:        ['maritime-mobility'],
  jungle_mobility: ['jungle-mobility'],
  urban_mobility:  ['urban-mobility'],
  cold_weather:    ['cold-weather-arctic-operations'],
  small_team:      ['small-team-rescue'],
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

// A course's sector, for the staffing gate. course_category 'tactical' is the
// military sector; everything else is civilian.
export function courseSector(course_category: string | null): 'military' | 'civilian' {
  return course_category === 'tactical' ? 'military' : 'civilian'
}
