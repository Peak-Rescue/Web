'use client'

import { useState, useMemo } from 'react'
import { CERT_META, CERT_ORDER, certStatus, type CertType } from '@/lib/certs'

type RawCert = {
  id: string
  cert_type: string
  level: string | null
  notes: string | null
  expires_at: string | null
  instructor_cert_documents: { id: string; url: string; file_name: string | null }[]
}

type Instructor = {
  id: string
  first_name: string | null
  last_name: string | null
  email: string | null
  phone: string | null
  instructor_certs: RawCert[]
}

type StatusFilter = 'all' | 'current' | 'expiring' | 'expired'

// Certs that have ordered levels
const LEVEL_ORDER: Partial<Record<CertType, string[]>> = {
  emt:         ['Basic', 'Intermediate', 'Paramedic'],
  amga_rock:   ['Apprentice', 'Assistant', 'Certified'],
  amga_alpine: ['Apprentice', 'Assistant', 'Certified'],
  amga_ski:    ['Apprentice', 'Assistant', 'Certified'],
  sprat:       ['Level 1', 'Level 2', 'Level 3'],
  avy:         ['Rec 1', 'Rec 2', 'Pro 1', 'Pro 2'],
  lnt:         ['LNT 1 (Trainer)', 'LNT 2 (Master Educator)'],
}

const LEVEL_LABEL: Record<string, string> = {
  'Apprentice':              'Rock 1',
  'Assistant':               'Rock 2',
  'Certified':               'Rock 3',
  'Basic':                   'EMT-B',
  'Intermediate':            'EMT-I',
  'Paramedic':               'Para',
  'Level 1':                 'L1',
  'Level 2':                 'L2',
  'Level 3':                 'L3',
  'Rec 1':                   'Rec 1',
  'Rec 2':                   'Rec 2',
  'Pro 1':                   'Pro 1',
  'Pro 2':                   'Pro 2',
  'LNT 1 (Trainer)':         'LNT 1',
  'LNT 2 (Master Educator)': 'LNT 2',
}


function levelLabel(level: string, certType: string): string {
  if (certType === 'amga_alpine') {
    const n = { 'Apprentice': '1', 'Assistant': '2', 'Certified': '3' }[level]
    if (n) return `Alp ${n}`
  }
  if (certType === 'amga_ski') {
    const n = { 'Apprentice': '1', 'Assistant': '2', 'Certified': '3' }[level]
    if (n) return `Ski ${n}`
  }
  return LEVEL_LABEL[level] ?? level
}

function StatusDot({ status, level, certType, notes }: { status: string; level: string | null; certType: string; notes: string | null }) {
  const textColors = {
    current:  'text-green-400',
    expiring: 'text-yellow-400',
    expired:  'text-red-400',
    missing:  'text-zinc-600',
  }
  const dotColors = {
    current:  'bg-green-400',
    expiring: 'bg-yellow-400',
    expired:  'bg-red-400',
    missing:  'bg-zinc-700',
  }

  const isOther = certType === 'other_ems' || certType === 'other'
  const abbr = isOther && notes
    ? notes.slice(0, 6)
    : level ? levelLabel(level, certType) : null

  if (abbr && status !== 'missing') {
    return (
      <span
        className={`inline-flex items-center justify-center rounded px-1 py-0.5 text-[10px] font-bold leading-none bg-zinc-800 ${textColors[status as keyof typeof textColors] ?? 'text-zinc-400'}`}
        title={isOther ? (notes ?? status) : (level ?? status)}
      >
        {abbr}
      </span>
    )
  }

  return (
    <span
      className={`inline-block w-2.5 h-2.5 rounded-full ${dotColors[status as keyof typeof dotColors] ?? 'bg-zinc-700'}`}
      title={level ?? status}
    />
  )
}

// levelFilters: map of certType -> minimum level index (instructors must be >= this level)
// A cert type in levelFilters implicitly requires that cert.

export function InstructorTable({ instructors }: { instructors: Instructor[] }) {
  const [requiredCerts, setRequiredCerts] = useState<Set<CertType>>(new Set())
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [levelFilters, setLevelFilters] = useState<Map<CertType, number>>(new Map())
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [previewDoc, setPreviewDoc] = useState<{ url: string; name: string } | null>(null)

  function isImage(url: string) {
    return /\.(jpe?g|png|gif|webp|svg)(\?|$)/i.test(url)
  }

  function toggleCert(type: CertType) {
    setRequiredCerts(prev => {
      const next = new Set(prev)
      if (next.has(type)) {
        next.delete(type)
        // clear any level filter for this cert when deselecting
        setLevelFilters(lf => { const m = new Map(lf); m.delete(type); return m })
      } else {
        next.add(type)
      }
      return next
    })
  }

  function setMinLevel(type: CertType, levelIndex: number) {
    setLevelFilters(prev => {
      const next = new Map(prev)
      if (next.get(type) === levelIndex) {
        // clicking active level clears it
        next.delete(type)
      } else {
        next.set(type, levelIndex)
        // implicitly require this cert
        setRequiredCerts(rc => new Set([...rc, type]))
      }
      return next
    })
  }

  const filtered = useMemo(() => {
    // Effective required certs = explicit toggles + any cert with a level filter
    const effective = new Set([...requiredCerts, ...levelFilters.keys()])

    return instructors.filter(instructor => {
      const certMap = Object.fromEntries(instructor.instructor_certs.map(c => [c.cert_type, c]))

      if (effective.size > 0) {
        for (const type of effective) {
          const cert = certMap[type]
          if (!cert) return false
          if (certStatus(cert.expires_at) === 'expired') return false

          const minIdx = levelFilters.get(type)
          if (minIdx !== undefined) {
            const levels = LEVEL_ORDER[type]
            if (levels && cert.level) {
              const instructorIdx = levels.indexOf(cert.level)
              if (instructorIdx < minIdx) return false
            }
          }
        }
      }

      if (statusFilter !== 'all') {
        const hasMatchingStatus = instructor.instructor_certs.some(
          c => certStatus(c.expires_at) === statusFilter
        )
        if (!hasMatchingStatus) return false
      }

      return true
    })
  }, [instructors, requiredCerts, levelFilters, statusFilter])

  const hasFilters = requiredCerts.size > 0 || statusFilter !== 'all' || levelFilters.size > 0

  function clearAll() {
    setRequiredCerts(new Set())
    setStatusFilter('all')
    setLevelFilters(new Map())
  }

  const certsWithLevels = CERT_ORDER.filter(type => LEVEL_ORDER[type])

  return (
    <div>
      {/* Filter bar */}
      <div className="mb-6 p-4 bg-zinc-900 rounded-lg border border-zinc-800 space-y-4">

        {/* Cert presence */}
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-xs font-medium text-zinc-400 uppercase tracking-wider shrink-0">Has cert</span>
          <div className="flex flex-wrap gap-2">
            {CERT_ORDER.map(type => {
              const active = requiredCerts.has(type) || levelFilters.has(type)
              return (
                <button
                  key={type}
                  onClick={() => toggleCert(type)}
                  className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                    active
                      ? 'bg-pr-red-light text-white'
                      : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-white'
                  }`}
                >
                  {CERT_META[type].label}
                </button>
              )
            })}
          </div>
        </div>

        {/* Status */}
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-xs font-medium text-zinc-400 uppercase tracking-wider shrink-0">Status</span>
          <div className="flex gap-2">
            {(['all', 'current', 'expiring', 'expired'] as const).map(s => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`px-2.5 py-1 rounded text-xs font-medium transition-colors capitalize ${
                  statusFilter === s
                    ? 'bg-pr-red-light text-white'
                    : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-white'
                }`}
              >
                {s === 'all' ? 'Any' : s}
              </button>
            ))}
          </div>
        </div>

        {/* Advanced toggle */}
        <div className="border-t border-zinc-800 pt-3">
          <button
            onClick={() => setShowAdvanced(v => !v)}
            className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="12" height="12"
              viewBox="0 0 24 24"
              fill="none" stroke="currentColor" strokeWidth="2"
              strokeLinecap="round" strokeLinejoin="round"
              className={`transition-transform ${showAdvanced ? 'rotate-90' : ''}`}
            >
              <polyline points="9 18 15 12 9 6" />
            </svg>
            Advanced: minimum certification level
            {levelFilters.size > 0 && (
              <span className="ml-1 px-1.5 py-0.5 rounded-full bg-pr-red/20 text-pr-red-light text-[10px] font-bold">
                {levelFilters.size} active
              </span>
            )}
          </button>

          {showAdvanced && (
            <div className="mt-3 space-y-3">
              {certsWithLevels.map(type => {
                const levels = LEVEL_ORDER[type]!
                const activeIdx = levelFilters.get(type)
                return (
                  <div key={type} className="flex flex-wrap items-center gap-3">
                    <span className="text-xs text-zinc-500 w-24 shrink-0">{CERT_META[type].label}</span>
                    <div className="flex items-center gap-1">
                      <span className="text-[10px] text-zinc-600 mr-1">min level:</span>
                      {levels.map((level, idx) => {
                        const isActive = activeIdx === idx
                        const isAboveActive = activeIdx !== undefined && idx > activeIdx
                        return (
                          <button
                            key={level}
                            onClick={() => setMinLevel(type, idx)}
                            title={level}
                            className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${
                              isActive
                                ? 'bg-pr-red-light text-white'
                                : isAboveActive
                                ? 'bg-pr-red/20 text-pr-red-light'
                                : 'bg-zinc-800 text-zinc-500 hover:bg-zinc-700 hover:text-white'
                            }`}
                          >
                            {levelLabel(level, type)}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {hasFilters && (
          <button
            onClick={clearAll}
            className="text-xs text-zinc-500 hover:text-white underline underline-offset-2"
          >
            Clear all filters
          </button>
        )}
      </div>

      <div className="text-xs text-zinc-500 mb-3">
        {filtered.length === instructors.length
          ? `${instructors.length} instructors`
          : `${filtered.length} of ${instructors.length} instructors`}
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-800">
              <th className="text-left py-3 pr-6 text-zinc-400 font-medium whitespace-nowrap">Instructor</th>
              {CERT_ORDER.map(type => (
                <th
                  key={type}
                  className={`text-center py-3 px-2 font-medium whitespace-nowrap transition-colors ${
                    requiredCerts.has(type) || levelFilters.has(type) ? 'text-pr-red-light' : 'text-zinc-400'
                  }`}
                >
                  {CERT_META[type].label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={CERT_ORDER.length + 1} className="py-10 text-center text-zinc-500">
                  No instructors match the current filters
                </td>
              </tr>
            ) : filtered.map((instructor) => {
              const certMap = Object.fromEntries(instructor.instructor_certs.map(c => [c.cert_type, c]))

              return (
                <tr key={instructor.id} className="border-b border-zinc-900 hover:bg-zinc-900/50">
                  <td className="py-3 pr-6 whitespace-nowrap">
                    <div className="font-medium">
                      {instructor.first_name ? `${instructor.first_name} ${instructor.last_name ?? ''}`.trim() : 'Unnamed'}
                    </div>
                    {instructor.email && <div className="text-xs text-zinc-400 mt-0.5">{instructor.email}</div>}
                    {instructor.phone && <div className="text-xs text-zinc-500">{instructor.phone}</div>}
                  </td>
                  {CERT_ORDER.map(type => {
                    const cert = certMap[type as CertType]
                    const status = cert ? certStatus(cert.expires_at) : 'missing'
                    const docs = cert?.instructor_cert_documents ?? []
                    return (
                      <td key={type} className="py-3 px-2 text-center">
                        <div className="flex flex-col items-center">
                          <div className="h-6 flex items-center justify-center">
                            <StatusDot status={status} level={cert?.level ?? null} certType={type} notes={cert?.notes ?? null} />
                          </div>
                          <div className="h-5 flex items-center justify-center gap-2">
                            {docs.map((doc, i) => (
                              <button
                                key={doc.id}
                                onClick={() => setPreviewDoc({ url: doc.url, name: doc.file_name ?? `Document ${i + 1}` })}
                                className="text-zinc-500 hover:text-pr-red-light cursor-pointer"
                                title={doc.file_name ?? `Document ${i + 1}`}
                              >
                                <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
                                </svg>
                              </button>
                            ))}
                          </div>
                        </div>
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {previewDoc && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70"
          onClick={() => setPreviewDoc(null)}
        >
          <div
            className="relative bg-zinc-900 rounded-lg shadow-xl max-w-4xl w-full mx-4 overflow-hidden"
            style={{ maxHeight: '90vh' }}
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-2 border-b border-zinc-700">
              <span className="text-sm text-zinc-300 truncate">{previewDoc.name}</span>
              <button onClick={() => setPreviewDoc(null)} className="text-zinc-400 hover:text-white ml-4 text-lg leading-none">&times;</button>
            </div>
            {isImage(previewDoc.url) ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={previewDoc.url} alt={previewDoc.name} className="max-w-full max-h-[80vh] object-contain mx-auto block p-4" />
            ) : (
              <iframe
                src={`https://docs.google.com/viewer?url=${encodeURIComponent(previewDoc.url)}&embedded=true`}
                className="w-full border-0"
                style={{ height: '80vh' }}
              />
            )}
          </div>
        </div>
      )}

      <div className="mt-8 flex items-center gap-6 text-xs text-zinc-400">
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-green-400" /> Current</span>
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-yellow-400" /> Expiring &lt;60 days</span>
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-red-400" /> Expired</span>
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-zinc-600" /> Not on file</span>
      </div>
    </div>
  )
}
