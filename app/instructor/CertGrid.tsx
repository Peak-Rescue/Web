'use client'

import { useRef, useState } from 'react'
import { CERT_META, certStatus, type CertType } from '@/lib/certs'

type CertDoc = {
  id: string
  url: string
  file_name: string | null
  created_at: string
}

type DbCert = {
  id: string
  cert_type: CertType
  level: string | null
  expires_at: string | null
  notes: string | null
  instructor_cert_documents: CertDoc[]
}

type PendingDoc = {
  url: string
  fileName: string
}

const CERT_CATEGORIES: { label: string; types: CertType[] }[] = [
  { label: 'Medical',    types: ['cpr', 'wfr', 'emt', 'other_ems'] },
  { label: 'Guiding',   types: ['amga_rock', 'amga_alpine', 'amga_ski', 'ifmga', 'avy', 'lnt'] },
  { label: 'Industrial', types: ['sprat'] },
  { label: 'Water & Canyon', types: ['swiftwater', 'canyoneering'] },
  { label: 'Other',     types: ['other'] },
]

const STATUS_STYLES = {
  current:  'bg-green-900/40 border-green-700 text-green-400',
  expiring: 'bg-yellow-900/40 border-yellow-600 text-yellow-400',
  expired:  'bg-red-900/40 border-red-700 text-red-400',
  missing:  'bg-zinc-900 border-zinc-700 text-zinc-500',
}

const STATUS_BADGE = {
  current:  { label: 'Current',     dot: 'bg-green-400' },
  expiring: { label: 'Expiring',    dot: 'bg-yellow-400' },
  expired:  { label: 'Expired',     dot: 'bg-red-400' },
  missing:  { label: 'Not on file', dot: 'bg-zinc-600' },
}

type CertGridActions = {
  upsertCert: (fd: FormData) => Promise<{ id: string; cert_type: CertType; level: string | null; expires_at: string | null; notes: string | null } | null>
  deleteCert: (id: string) => Promise<void>
  addCertDocument: (certId: string, url: string, fileName: string) => Promise<CertDoc | null>
  deleteCertDocument: (docId: string) => Promise<void>
}

export default function CertGrid({ initialCerts, actions }: { initialCerts: DbCert[]; actions: CertGridActions }) {
  const { upsertCert, deleteCert, addCertDocument, deleteCertDocument } = actions
  const [certs, setCerts] = useState(initialCerts)
  const [editing, setEditing] = useState<CertType | null>(null)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [pendingDocs, setPendingDocs] = useState<PendingDoc[]>([])
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const [currentLevel, setCurrentLevel] = useState<string>('')
  const [originalLevel, setOriginalLevel] = useState<string>('')
  const [currentExpiry, setCurrentExpiry] = useState<string>('')
  const [originalExpiry, setOriginalExpiry] = useState<string>('')
  const formRef = useRef<HTMLFormElement>(null)

  const certMap = Object.fromEntries(certs.map(c => [c.cert_type, c]))

  function openEdit(type: CertType) {
    if (editing === type) {
      setEditing(null)
    } else {
      setEditing(type)
      setPendingDocs([])
      const lvl = certMap[type]?.level ?? ''
      setCurrentLevel(lvl)
      setOriginalLevel(lvl)
      const exp = certMap[type]?.expires_at?.slice(0, 10) ?? ''
      setCurrentExpiry(exp)
      setOriginalExpiry(exp)
    }
  }

  const levelChanged = !!(
    editing &&
    certMap[editing] &&
    CERT_META[editing].hasLevel &&
    currentLevel !== originalLevel
  )

  const expiryChanged = !!(
    editing &&
    certMap[editing] &&
    CERT_META[editing].hasExpiry &&
    currentExpiry !== originalExpiry
  )

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>, certType: CertType) {
    const file = e.target.files?.[0]
    if (!file) return

    setUploading(true)

    const fd = new FormData()
    fd.append('file', file)
    fd.append('cert_type', certType)

    try {
      const res = await fetch('/api/upload-cert', { method: 'POST', body: fd })
      const json = await res.json()
      if (!res.ok) {
        alert(`Upload failed: ${json.error}`)
        setUploading(false)
        e.target.value = ''
        return
      }

      const existingCert = certMap[certType]
      if (existingCert) {
        const doc = await addCertDocument(existingCert.id, json.url, json.fileName ?? file.name)
        if (doc) {
          setCerts(prev => prev.map(c =>
            c.cert_type === certType
              ? { ...c, instructor_cert_documents: [...c.instructor_cert_documents, doc as CertDoc] }
              : c
          ))
        }
      } else {
        setPendingDocs(prev => [...prev, { url: json.url, fileName: json.fileName ?? file.name }])
      }
    } catch (err) {
      alert(`Upload error: ${err}`)
    }

    setUploading(false)
    e.target.value = ''
  }

  async function handleSubmit(e: React.SyntheticEvent<HTMLFormElement>, certType: CertType) {
    e.preventDefault()
    const savedDocs = certMap[certType]?.instructor_cert_documents ?? []
    if (savedDocs.length === 0 && pendingDocs.length === 0) {
      alert('Please upload at least one document before saving.')
      return
    }
    if (levelChanged) {
      if (pendingDocs.length === 0) {
        alert('Level changed — please upload a new document for the updated level.')
        return
      }
    }
    if (expiryChanged && pendingDocs.length === 0) {
      alert('Expiration date changed — please upload the renewed certificate document.')
      return
    }
    if (levelChanged && CERT_META[certType].hasExpiry && !currentExpiry) {
      alert('Level changed — please enter a new expiration date.')
      return
    }
    setSaving(true)
    try {
      const fd = new FormData(e.currentTarget)
      const saved = await upsertCert(fd)
      if (saved) {
        const existing = certMap[saved.cert_type as CertType]
        const oldDocs = existing?.instructor_cert_documents ?? []
        let docs: CertDoc[] = []

        for (const pending of pendingDocs) {
          const doc = await addCertDocument(saved.id, pending.url, pending.fileName)
          if (doc) docs = [...docs, doc as CertDoc]
        }

        // Replace old docs when new ones are uploaded
        if (pendingDocs.length > 0 && oldDocs.length > 0) {
          for (const old of oldDocs) {
            await deleteCertDocument(old.id)
          }
        } else if (pendingDocs.length === 0) {
          docs = oldDocs
        }

        const merged: DbCert = { ...saved as DbCert, instructor_cert_documents: docs }
        setCerts(prev => [...prev.filter(c => c.cert_type !== saved.cert_type), merged])
        setPendingDocs([])
      }
      setEditing(null)
    } catch (err) {
      alert(`Save failed: ${err}`)
    }
    setSaving(false)
  }

  async function handleDelete(id: string, type: CertType) {
    await deleteCert(id)
    setCerts(prev => prev.filter(c => c.cert_type !== type))
    setEditing(null)
  }

  async function handleDeleteDoc(docId: string, certType: CertType) {
    try {
      await deleteCertDocument(docId)
      setCerts(prev => prev.map(c =>
        c.cert_type === certType
          ? { ...c, instructor_cert_documents: c.instructor_cert_documents.filter(d => d.id !== docId) }
          : c
      ))
    } catch (err) {
      alert(`Failed to remove document: ${err}`)
    }
  }

  return (
    <div className="space-y-4">
      {CERT_CATEGORIES.map(category => {
        const isCollapsed = collapsed[category.label]
        const certsInCategory = category.types.map(t => certMap[t]).filter(Boolean)
        const hasExpiring = certsInCategory.some(c => c && certStatus(c.expires_at) === 'expiring')
        const hasExpired = certsInCategory.some(c => c && certStatus(c.expires_at) === 'expired')

        return (
          <div key={category.label} className="rounded-lg border border-zinc-800 overflow-hidden">
            <button
              type="button"
              onClick={() => setCollapsed(prev => ({ ...prev, [category.label]: !prev[category.label] }))}
              className="w-full flex items-center justify-between px-4 py-3 bg-zinc-900 hover:bg-zinc-800 transition-colors"
            >
              <span className="font-semibold text-white">{category.label}</span>
              <div className="flex items-center gap-2">
                {hasExpired && <span className="w-2 h-2 rounded-full bg-red-400" />}
                {hasExpiring && !hasExpired && <span className="w-2 h-2 rounded-full bg-yellow-400" />}
                <span className="text-zinc-500 text-sm">{isCollapsed ? '▸' : '▾'}</span>
              </div>
            </button>

            {!isCollapsed && (
              <div className="p-3 space-y-2">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {category.types.map(type => {
                    const meta = CERT_META[type]
                    const cert = certMap[type]
                    const status = cert ? certStatus(cert.expires_at) : 'missing'
                    const styles = STATUS_STYLES[status]
                    const badge = STATUS_BADGE[status]
                    const docCount = cert?.instructor_cert_documents?.length ?? 0

                    return (
                      <button
                        key={type}
                        onClick={() => openEdit(type)}
                        className={`text-left p-3 rounded-lg border transition-all ${styles} ${editing === type ? 'ring-2 ring-pr-red' : 'hover:brightness-110'}`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <span className="font-medium text-white text-sm">{meta.label}</span>
                          <span className="flex items-center gap-1.5 text-xs shrink-0 mt-0.5">
                            <span className={`w-2 h-2 rounded-full ${badge.dot}`} />
                            {badge.label}
                          </span>
                        </div>
                        {cert?.level && <div className="text-xs mt-1 opacity-80">{cert.level}</div>}
                        {cert?.expires_at && (
                          <div className="text-xs mt-1 opacity-70">
                            Expires {new Date(cert.expires_at).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}
                          </div>
                        )}
                        {docCount > 0 && (
                          <div className="text-xs mt-1 opacity-60 flex items-center gap-1">
                            <span>📄</span> {docCount} doc{docCount !== 1 ? 's' : ''} on file
                          </div>
                        )}
                      </button>
                    )
                  })}
                </div>

                {editing && category.types.includes(editing) && (
                  <div className="mt-3 p-4 rounded-lg bg-zinc-950 border border-zinc-700">
                    <h3 className="font-semibold text-white mb-3">
                      {certMap[editing] ? 'Edit' : 'Add'} {CERT_META[editing].label}
                    </h3>
                    <form ref={formRef} onSubmit={e => handleSubmit(e, editing)} className="space-y-3">
                      <input type="hidden" name="cert_type" value={editing} />
                      {certMap[editing] && <input type="hidden" name="id" value={certMap[editing].id} />}

                      {CERT_META[editing].hasLevel && CERT_META[editing].levelOptions && (
                        <div>
                          <label className="block text-sm text-zinc-400 mb-1">Level</label>
                          <select
                            name="level"
                            value={currentLevel}
                            onChange={e => setCurrentLevel(e.target.value)}
                            className="w-full px-3 py-2 bg-zinc-800 border border-zinc-600 rounded text-white focus:outline-none focus:border-pr-red"
                          >
                            <option value="">Select level…</option>
                            {CERT_META[editing].levelOptions!.map(l => (
                              <option key={l} value={l}>{l}</option>
                            ))}
                          </select>
                          {levelChanged && (
                            <p className="mt-1.5 text-xs text-yellow-400">
                              Level changed — a new document{CERT_META[editing].hasExpiry ? ' and expiration date are' : ' is'} required.
                            </p>
                          )}
                        </div>
                      )}

                      {CERT_META[editing].hasExpiry && (
                        <div>
                          <label className="block text-sm text-zinc-400 mb-1">Expiration date</label>
                          <input
                            type="date"
                            name="expires_at"
                            value={levelChanged ? '' : currentExpiry}
                            onChange={e => setCurrentExpiry(e.target.value)}
                            className="w-full px-3 py-2 bg-zinc-800 border border-zinc-600 rounded text-white focus:outline-none focus:border-pr-red"
                          />
                          {expiryChanged && (
                            <p className="mt-1.5 text-xs text-yellow-400">
                              Expiration date changed — please upload the renewed certificate document.
                            </p>
                          )}
                        </div>
                      )}

                      {CERT_META[editing].hasNotes && (
                        <div>
                          <label className="block text-sm text-zinc-400 mb-1">Cert name</label>
                          <input
                            type="text"
                            name="notes"
                            defaultValue={certMap[editing]?.notes ?? ''}
                            placeholder="Describe the certification…"
                            className="w-full px-3 py-2 bg-zinc-800 border border-zinc-600 rounded text-white placeholder-zinc-500 focus:outline-none focus:border-pr-red"
                          />
                        </div>
                      )}

                    </form>

                    <div className="mt-4 pt-4 border-t border-zinc-800">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm text-zinc-400">Documents</span>
                        <label className={`flex items-center gap-2 px-3 py-1.5 text-xs rounded border cursor-pointer transition-colors ${uploading ? 'border-zinc-700 text-zinc-600 cursor-not-allowed' : 'border-zinc-600 text-zinc-300 hover:border-pr-red hover:text-pr-red-light'}`}>
                          {uploading ? 'Uploading…' : '+ Add file'}
                          <input
                            type="file"
                            accept=".pdf,.jpg,.jpeg,.png"
                            className="hidden"
                            onChange={e => handleFileChange(e, editing)}
                            disabled={uploading}
                          />
                        </label>
                      </div>

                      {(() => {
                        const savedDocs = certMap[editing]?.instructor_cert_documents ?? []
                        const allDocs = [...savedDocs, ...pendingDocs.map(p => ({ id: '', url: p.url, file_name: p.fileName, created_at: '', pending: true }))]
                        if (allDocs.length === 0) return (
                          <p className="text-xs text-zinc-600">No documents uploaded yet.</p>
                        )
                        return (
                          <ul className="space-y-1.5">
                            {savedDocs.map(doc => (
                              <li key={doc.id} className="flex items-center gap-2 text-sm">
                                <a href={doc.url} target="_blank" rel="noopener noreferrer" className="flex-1 truncate text-pr-red-light hover:text-pr-red-light">
                                  📄 {doc.file_name ?? 'document'}
                                </a>
                                <button type="button" onClick={() => handleDeleteDoc(doc.id, editing)} className="text-zinc-600 hover:text-red-400 text-xs shrink-0" title="Remove">✕</button>
                              </li>
                            ))}
                            {pendingDocs.map((doc, i) => (
                              <li key={`pending-${i}`} className="flex items-center gap-2 text-sm">
                                <span className="flex-1 truncate text-zinc-400">📄 {doc.fileName} <span className="text-zinc-600">(save to attach)</span></span>
                                <button type="button" onClick={() => setPendingDocs(prev => prev.filter((_, j) => j !== i))} className="text-zinc-600 hover:text-red-400 text-xs shrink-0" title="Remove">✕</button>
                              </li>
                            ))}
                          </ul>
                        )
                      })()}
                    </div>

                    <div className="flex gap-3 pt-4">
                      <button
                        type="button"
                        disabled={saving || uploading}
                        onClick={() => formRef.current?.requestSubmit()}
                        className="px-4 py-2 bg-pr-red hover:bg-pr-red-light disabled:opacity-50 text-white rounded font-medium transition-colors"
                      >
                        {saving ? 'Saving…' : 'Save'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditing(null)}
                        className="px-4 py-2 bg-zinc-700 hover:bg-zinc-600 text-white rounded font-medium transition-colors"
                      >
                        Cancel
                      </button>
                      {certMap[editing] && (
                        <button
                          type="button"
                          onClick={() => handleDelete(certMap[editing].id, editing)}
                          className="ml-auto px-4 py-2 bg-red-900/50 hover:bg-red-800 text-red-300 rounded font-medium transition-colors"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
