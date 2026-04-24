'use client'

import { useState } from 'react'
import { CAPABILITY_META, CAPABILITY_ORDER, type CapabilityCategory, type CapabilityRole } from '@/lib/capabilities'

type Capability = { category: CapabilityCategory; role: CapabilityRole }

type Actions = {
  setCapability: (category: CapabilityCategory, role: CapabilityRole) => Promise<void>
  removeCapability: (category: CapabilityCategory) => Promise<void>
}

export default function CapabilityPanel({ initialCapabilities, actions }: { initialCapabilities: Capability[]; actions: Actions }) {
  const [capabilities, setCapabilities] = useState(initialCapabilities)
  const [saving, setSaving] = useState<CapabilityCategory | null>(null)

  const capMap = Object.fromEntries(capabilities.map(c => [c.category, c.role])) as Partial<Record<CapabilityCategory, CapabilityRole>>

  async function handleSet(category: CapabilityCategory, role: CapabilityRole) {
    if (saving) return
    setSaving(category)
    try {
      if (capMap[category] === role) {
        await actions.removeCapability(category)
        setCapabilities(prev => prev.filter(c => c.category !== category))
      } else {
        await actions.setCapability(category, role)
        setCapabilities(prev => [...prev.filter(c => c.category !== category), { category, role }])
      }
    } finally {
      setSaving(null)
    }
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
      {CAPABILITY_ORDER.map(category => {
        const current = capMap[category]
        const isSaving = saving === category
        return (
          <div key={category} className="p-3 rounded-lg border border-zinc-800 bg-zinc-900">
            <div className="text-sm font-medium text-white mb-2">{CAPABILITY_META[category].label}</div>
            <div className="flex gap-1.5">
              {(['lead', 'assist'] as CapabilityRole[]).map(role => (
                <button
                  key={role}
                  disabled={!!isSaving}
                  onClick={() => handleSet(category, role)}
                  className={`flex-1 px-2 py-1 rounded text-xs font-medium capitalize transition-colors disabled:opacity-50 ${
                    current === role
                      ? role === 'lead'
                        ? 'bg-teal-700 text-white'
                        : 'bg-blue-700 text-white'
                      : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-white'
                  }`}
                >
                  {role}
                </button>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}
