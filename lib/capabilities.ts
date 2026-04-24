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
