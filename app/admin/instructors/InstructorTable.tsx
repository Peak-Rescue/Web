'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { CERT_META, CERT_GROUPS, CERT_ORDER, certStatus, type CertType, type CertGroup } from '@/lib/certs'
import { CAPABILITY_META, CAPABILITY_ORDER, type CapabilityCategory, type CapabilityRole } from '@/lib/capabilities'
import { formatPhone } from '@/lib/phone'

type RawCert = {
  id: string
  cert_type: string
  level: string | null
  notes: string | null
  expires_at: string | null
  instructor_cert_documents: { id: string; url: string; file_name: string | null }[]
}

type RawCapability = {
  category: CapabilityCategory
  role: CapabilityRole
}

type Instructor = {
  id: string
  first_name: string | null
  last_name: string | null
  email: string | null
  phone: string | null
  instructor_certs: RawCert[]
  instructor_capabilities: RawCapability[]
}

type StatusFilter = 'all' | 'current' | 'expiring' | 'expired'

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

const DOT_COLORS = {
  current:  'bg-green-400',
  expiring: 'bg-yellow-400',
  expired:  'bg-red-400',
  missing:  'bg-zinc-700',
}

function GroupSummaryCell({ group, certMap }: { group: CertGroup; certMap: Record<string, RawCert> }) {
  return (
    <td className="py-3 px-3 text-center align-middle">
      <div className="flex flex-wrap justify-center gap-1">
        {group.certs.map(type => {
          const cert = certMap[type]
          const status = cert ? certStatus(cert.expires_at) : 'missing'
          return (
            <span
              key={type}
              className={`inline-block w-2 h-2 rounded-full ${DOT_COLORS[status]}`}
              title={`${CERT_META[type].label}: ${status}`}
            />
          )
        })}
      </div>
    </td>
  )
}

export function InstructorTable({ instructors, isAdmin = false }: { instructors: Instructor[]; isAdmin?: boolean }) {
  const [requiredCerts, setRequiredCerts] = useState<Set<CertType>>(new Set())
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [levelFilters, setLevelFilters] = useState<Map<CertType, number>>(new Map())
  const [expertiseFilter, setExpertiseFilter] = useState<Set<CapabilityCategory>>(new Set())
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set())
  const [previewDoc, setPreviewDoc] = useState<{ url: string; name: string } | null>(null)
  const [emailsCopied, setEmailsCopied] = useState(false)

  function toggleExpertise(cat: CapabilityCategory) {
    setExpertiseFilter(prev => {
      const next = new Set(prev)
      if (next.has(cat)) next.delete(cat)
      else next.add(cat)
      return next
    })
  }

  function isImage(url: string) {
    return /\.(jpe?g|png|gif|webp|svg)(\?|$)/i.test(url)
  }

  function toggleCert(type: CertType) {
    setRequiredCerts(prev => {
      const next = new Set(prev)
      if (next.has(type)) {
        next.delete(type)
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
        next.delete(type)
      } else {
        next.set(type, levelIndex)
        setRequiredCerts(rc => new Set([...rc, type]))
      }
      return next
    })
  }

  function toggleGroup(id: string) {
    setCollapsedGroups(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const filtered = useMemo(() => {
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

      if (expertiseFilter.size > 0) {
        const capMap = new Set(instructor.instructor_capabilities.map(c => c.category))
        for (const cat of expertiseFilter) {
          if (!capMap.has(cat)) return false
        }
      }

      return true
    })
  }, [instructors, requiredCerts, levelFilters, statusFilter, expertiseFilter])

  const hasFilters = requiredCerts.size > 0 || statusFilter !== 'all' || levelFilters.size > 0 || expertiseFilter.size > 0

  function clearAll() {
    setRequiredCerts(new Set())
    setStatusFilter('all')
    setLevelFilters(new Map())
    setExpertiseFilter(new Set())
  }

  function copyEmails() {
    const emails = filtered.map(i => i.email).filter(Boolean).join(', ')
    navigator.clipboard.writeText(emails)
    setEmailsCopied(true)
    setTimeout(() => setEmailsCopied(false), 2000)
  }

  const certsWithLevels = CERT_ORDER.filter(type => LEVEL_ORDER[type])

  return (
    <div>
      {/* Filter bar */}
      <div className="mb-6 p-4 bg-zinc-900 rounded-lg border border-zinc-800 space-y-4">

        {/* Cert presence — grouped by category */}
        <div className="space-y-2">
          <span className="text-xs font-medium text-zinc-400 uppercase tracking-wider">Has cert</span>
          {CERT_GROUPS.map(group => (
            <div key={group.id} className="flex flex-wrap items-center gap-3">
              <span className="text-xs text-zinc-500 w-20 shrink-0">{group.label}</span>
              <div className="flex flex-wrap gap-1.5">
                {group.certs.map(type => {
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
          ))}
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

        {/* Expertise */}
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-xs font-medium text-zinc-400 uppercase tracking-wider shrink-0">Expertise</span>
          <div className="flex flex-wrap gap-1.5">
            {CAPABILITY_ORDER.map(cat => {
              const active = expertiseFilter.has(cat)
              return (
                <button
                  key={cat}
                  onClick={() => toggleExpertise(cat)}
                  className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                    active
                      ? 'bg-teal-700 text-white'
                      : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-white'
                  }`}
                >
                  {CAPABILITY_META[cat].label}
                </button>
              )
            })}
          </div>
        </div>

        {/* Advanced: minimum level */}
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

      <div className="flex items-center justify-between mb-3">
        <div className="text-xs text-zinc-500">
          {filtered.length === instructors.length
            ? `${instructors.length} instructors`
            : `${filtered.length} of ${instructors.length} instructors`}
        </div>
        <button
          onClick={copyEmails}
          disabled={filtered.length === 0}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed bg-zinc-800 text-zinc-300 hover:bg-zinc-700 hover:text-white"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
          </svg>
          {emailsCopied ? 'Copied!' : `Copy ${filtered.length} email${filtered.length === 1 ? '' : 's'}`}
        </button>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            {/* Group header row */}
            <tr className="border-b border-zinc-700">
              <th rowSpan={2} className="text-left py-3 pr-6 text-zinc-400 font-medium whitespace-nowrap align-bottom">
                Instructor
              </th>
              {CERT_GROUPS.map(group => {
                const collapsed = collapsedGroups.has(group.id)
                const activeCerts = group.certs.filter(t => requiredCerts.has(t) || levelFilters.has(t))
                return (
                  <th
                    key={group.id}
                    colSpan={collapsed ? 1 : group.certs.length}
                    rowSpan={collapsed ? 2 : 1}
                    className={`text-center py-2 px-2 font-medium whitespace-nowrap border-l border-zinc-800 ${
                      activeCerts.length > 0 ? 'text-pr-red-light' : 'text-zinc-300'
                    }`}
                  >
                    <button
                      onClick={() => toggleGroup(group.id)}
                      className="flex items-center justify-center gap-1 mx-auto hover:text-white transition-colors"
                      title={collapsed ? `Expand ${group.label}` : `Collapse ${group.label}`}
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="10" height="10"
                        viewBox="0 0 24 24"
                        fill="none" stroke="currentColor" strokeWidth="2.5"
                        strokeLinecap="round" strokeLinejoin="round"
                        className={`transition-transform ${collapsed ? '-rotate-90' : ''}`}
                      >
                        <polyline points="6 9 12 15 18 9" />
                      </svg>
                      <span className="text-xs">{group.label}</span>
                      {activeCerts.length > 0 && (
                        <span className="px-1 py-0.5 rounded-full bg-pr-red/20 text-pr-red-light text-[9px] font-bold leading-none">
                          {activeCerts.length}
                        </span>
                      )}
                    </button>
                  </th>
                )
              })}
              {/* Capabilities group header */}
              {(() => {
                const collapsed = collapsedGroups.has('capabilities')
                return (
                  <th
                    colSpan={collapsed ? 1 : CAPABILITY_ORDER.length}
                    rowSpan={collapsed ? 2 : 1}
                    className="text-center py-2 px-2 font-medium whitespace-nowrap border-l border-zinc-700 text-zinc-300"
                  >
                    <button
                      onClick={() => toggleGroup('capabilities')}
                      className="flex items-center justify-center gap-1 mx-auto hover:text-white transition-colors"
                      title={collapsed ? 'Expand Expertise' : 'Collapse Expertise'}
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="10" height="10"
                        viewBox="0 0 24 24"
                        fill="none" stroke="currentColor" strokeWidth="2.5"
                        strokeLinecap="round" strokeLinejoin="round"
                        className={`transition-transform ${collapsed ? '-rotate-90' : ''}`}
                      >
                        <polyline points="6 9 12 15 18 9" />
                      </svg>
                      <span className="text-xs">Expertise</span>
                    </button>
                  </th>
                )
              })()}
            </tr>
            {/* Individual cert + capability header row — only for expanded groups */}
            <tr className="border-b border-zinc-800">
              {CERT_GROUPS.flatMap(group => {
                if (collapsedGroups.has(group.id)) return []
                return group.certs.map(type => (
                  <th
                    key={type}
                    className={`text-center py-2 px-2 font-medium whitespace-nowrap text-xs transition-colors ${
                      requiredCerts.has(type) || levelFilters.has(type) ? 'text-pr-red-light' : 'text-zinc-500'
                    }`}
                  >
                    {CERT_META[type].label}
                  </th>
                ))
              })}
              {!collapsedGroups.has('capabilities') && CAPABILITY_ORDER.map(cat => (
                <th
                  key={cat}
                  className="text-center py-2 px-2 font-medium whitespace-nowrap text-xs text-zinc-500"
                >
                  {CAPABILITY_META[cat].label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={99} className="py-10 text-center text-zinc-500">
                  No instructors match the current filters
                </td>
              </tr>
            ) : filtered.map((instructor) => {
              const certMap = Object.fromEntries(instructor.instructor_certs.map(c => [c.cert_type, c]))
              const capMap = Object.fromEntries(instructor.instructor_capabilities.map(c => [c.category, c.role])) as Partial<Record<CapabilityCategory, CapabilityRole>>

              return (
                <tr key={instructor.id} className="border-b border-zinc-900 hover:bg-zinc-900/50">
                  <td className="py-3 pr-6 whitespace-nowrap">
                    {isAdmin ? (
                      <Link href={`/admin/instructors/${instructor.id}`} className="font-medium hover:text-pr-red-light transition-colors">
                        {instructor.first_name ? `${instructor.first_name} ${instructor.last_name ?? ''}`.trim() : 'Unnamed'}
                      </Link>
                    ) : (
                      <span className="font-medium">
                        {instructor.first_name ? `${instructor.first_name} ${instructor.last_name ?? ''}`.trim() : 'Unnamed'}
                      </span>
                    )}
                    {instructor.email && <div className="text-xs text-zinc-400 mt-0.5">{instructor.email}</div>}
                    {instructor.phone && <div className="text-xs text-zinc-500">{formatPhone(instructor.phone)}</div>}
                  </td>
                  {CERT_GROUPS.flatMap(group => {
                    if (collapsedGroups.has(group.id)) {
                      return [<GroupSummaryCell key={group.id} group={group} certMap={certMap} />]
                    }
                    return group.certs.map(type => {
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
                    })
                  })}
                  {collapsedGroups.has('capabilities') ? (
                    <td className="py-3 px-3 text-center align-middle">
                      <div className="flex flex-wrap justify-center gap-1">
                        {CAPABILITY_ORDER.map(cat => {
                          const role = capMap[cat]
                          return (
                            <span
                              key={cat}
                              className={`inline-block w-2 h-2 rounded-full ${role === 'lead' ? 'bg-teal-500' : role === 'assist' ? 'bg-blue-500' : 'bg-zinc-700'}`}
                              title={`${CAPABILITY_META[cat].label}${role ? `: ${role}` : ''}`}
                            />
                          )
                        })}
                      </div>
                    </td>
                  ) : CAPABILITY_ORDER.map(cat => {
                    const role = capMap[cat]
                    return (
                      <td key={cat} className="py-3 px-2 text-center">
                        {role ? (
                          <span className={`inline-flex items-center justify-center rounded px-1.5 py-0.5 text-[10px] font-bold leading-none ${
                            role === 'lead' ? 'bg-teal-900/60 text-teal-300' : 'bg-blue-900/60 text-blue-300'
                          }`}>
                            {role === 'lead' ? 'L' : 'A'}
                          </span>
                        ) : (
                          <span className="inline-block w-2.5 h-2.5 rounded-full bg-zinc-800" />
                        )}
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

      <div className="mt-8 flex flex-wrap items-center gap-6 text-xs text-zinc-400">
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-green-400" /> Current</span>
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-yellow-400" /> Expiring &lt;60 days</span>
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-red-400" /> Expired</span>
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-zinc-600" /> Not on file</span>
        <span className="flex items-center gap-1.5"><span className="inline-flex items-center justify-center rounded px-1.5 py-0.5 text-[10px] font-bold leading-none bg-teal-900/60 text-teal-300">L</span> Expertise: Lead</span>
        <span className="flex items-center gap-1.5"><span className="inline-flex items-center justify-center rounded px-1.5 py-0.5 text-[10px] font-bold leading-none bg-blue-900/60 text-blue-300">A</span> Expertise: Assist</span>
      </div>
    </div>
  )
}
