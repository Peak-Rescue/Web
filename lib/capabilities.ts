export type CapabilityCategory =
  | 'industry' | 'rope_access' | 'aerial_evac' | 'canyoning'
  | 'swift_water' | 'backcountry' | 'confined_space' | 'military'

export type CapabilityRole = 'lead' | 'assist'

export const CAPABILITY_META: Record<CapabilityCategory, { label: string }> = {
  industry:       { label: 'Industry' },
  rope_access:    { label: 'Rope Access' },
  aerial_evac:    { label: 'Aerial Evac' },
  canyoning:      { label: 'Canyoning' },
  swift_water:    { label: 'Swift Water' },
  backcountry:    { label: 'Backcountry' },
  confined_space: { label: 'Confined Space' },
  military:       { label: 'Military' },
}

export const CAPABILITY_ORDER: CapabilityCategory[] = [
  'industry', 'rope_access', 'aerial_evac', 'canyoning',
  'swift_water', 'backcountry', 'confined_space', 'military',
]

// Maps each capability category to the course type slugs it covers.
// Used to filter the instructor dropdown in the course admin.
export const CATEGORY_COURSE_TYPES: Record<CapabilityCategory, string[]> = {
  industry:       ['emergency-response-team', 'firefighter-survival', 'fall-protection-rope-access', 'rope-rescue', 'standby-rescue', 'tv-rigging-safety'],
  rope_access:    ['rope-rescue', 'fall-protection-rope-access'],
  aerial_evac:    ['aerial-tramway-rescue', 'aerial-assets', 'zipline-adventure-park-rescue', 'stableflight'],
  canyoning:      ['canyoneering', 'class-c-canyon-rescue'],
  swift_water:    ['swiftwater-rescue', 'water-mobility', 'maritime-mobility'],
  backcountry:    ['mountain-rescue', 'mountain-mobility-training', 'small-team-rescue', 'cold-weather-arctic-operations'],
  confined_space: ['confined-space-rescue'],
  military:       ['jungle-mobility', 'urban-mobility', 'small-team-rescue', 'cold-weather-arctic-operations'],
}
