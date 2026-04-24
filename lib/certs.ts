export type CertType =
  | 'cpr' | 'wfr' | 'emt' | 'other_ems'
  | 'amga_rock' | 'amga_alpine' | 'amga_ski' | 'ifmga' | 'canyoneering' | 'avy' | 'lnt'
  | 'sprat'
  | 'swiftwater' | 'arborist' | 'other'

export type CertStatus = 'current' | 'expiring' | 'expired' | 'missing'

export const CERT_META: Record<CertType, {
  label: string
  hasLevel: boolean
  levelOptions?: string[]
  hasExpiry: boolean
  hasNotes: boolean
}> = {
  cpr:         { label: 'CPR',               hasLevel: false, hasExpiry: true,  hasNotes: false },
  wfr:         { label: 'WFR',               hasLevel: false, hasExpiry: true,  hasNotes: false },
  emt:         { label: 'EMT',               hasLevel: true,  levelOptions: ['Basic', 'Intermediate', 'Paramedic'], hasExpiry: true,  hasNotes: false },
  other_ems:   { label: 'Other EMS',         hasLevel: false, hasExpiry: true,  hasNotes: true  },
  amga_rock:   { label: 'AMGA Rock',         hasLevel: true,  levelOptions: ['Apprentice', 'Assistant', 'Certified'], hasExpiry: false, hasNotes: false },
  amga_alpine: { label: 'AMGA Alpine',       hasLevel: true,  levelOptions: ['Apprentice', 'Assistant', 'Certified'], hasExpiry: false, hasNotes: false },
  amga_ski:    { label: 'AMGA Ski',          hasLevel: true,  levelOptions: ['Apprentice', 'Assistant', 'Certified'], hasExpiry: false, hasNotes: false },
  ifmga:       { label: 'IFMGA',             hasLevel: false, hasExpiry: false, hasNotes: false },
  canyoneering:{ label: 'Canyoneering',      hasLevel: false, hasExpiry: false, hasNotes: true  },
  avy:         { label: 'Avalanche',         hasLevel: true,  levelOptions: ['Rec 1', 'Rec 2', 'Pro 1', 'Pro 2'], hasExpiry: false, hasNotes: false },
  lnt:         { label: 'Leave No Trace',    hasLevel: true,  levelOptions: ['LNT 1 (Trainer)', 'LNT 2 (Master Educator)'], hasExpiry: false, hasNotes: false },
  sprat:       { label: 'SPRAT',             hasLevel: true,  levelOptions: ['Level 1', 'Level 2', 'Level 3'],        hasExpiry: true,  hasNotes: false },
  swiftwater:  { label: 'Swift Water',       hasLevel: false, hasExpiry: false, hasNotes: true  },
  arborist:    { label: 'Arborist',          hasLevel: false, hasExpiry: false, hasNotes: true  },
  other:       { label: 'Other',             hasLevel: false, hasExpiry: true,  hasNotes: true  },
}

export type CertGroup = { id: string; label: string; certs: CertType[] }

export const CERT_GROUPS: CertGroup[] = [
  { id: 'medical',    label: 'Medical',    certs: ['cpr', 'wfr', 'emt', 'other_ems'] },
  { id: 'guiding',   label: 'Guiding',    certs: ['amga_rock', 'amga_alpine', 'amga_ski', 'ifmga', 'canyoneering', 'avy', 'lnt'] },
  { id: 'industrial', label: 'Industrial', certs: ['sprat'] },
  { id: 'other',     label: 'Other',      certs: ['swiftwater', 'arborist', 'other'] },
]

export const CERT_ORDER: CertType[] = CERT_GROUPS.flatMap(g => g.certs)

export function certStatus(expiresAt: string | null | undefined): CertStatus {
  if (!expiresAt) return 'current'
  const exp = new Date(expiresAt)
  const now = new Date()
  const daysUntil = Math.floor((exp.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
  if (daysUntil < 0) return 'expired'
  if (daysUntil <= 60) return 'expiring'
  return 'current'
}

export function hasIfmga(
  certs: Array<{ cert_type: string; level: string | null }>
): boolean {
  return certs.some(c => c.cert_type === 'ifmga')
}
