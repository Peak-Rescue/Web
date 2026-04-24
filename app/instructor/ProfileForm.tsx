'use client'

import { useState } from 'react'
import { formatPhone } from '@/lib/phone'

type Props = {
  initialEmail: string | null
  initialPhone: string | null
  initialEmergencyName: string | null
  initialEmergencyRelationship: string | null
  initialEmergencyPhone: string | null
  onUpdateProfile: (data: {
    email: string
    phone: string
    emergency_name: string
    emergency_relationship: string
    emergency_phone: string
  }) => Promise<void>
}

export default function ProfileForm({
  initialEmail,
  initialPhone,
  initialEmergencyName,
  initialEmergencyRelationship,
  initialEmergencyPhone,
  onUpdateProfile,
}: Props) {
  const [email, setEmail] = useState(initialEmail ?? '')
  const [phone, setPhone] = useState(formatPhone(initialPhone) ?? '')
  const [emergencyName, setEmergencyName] = useState(initialEmergencyName ?? '')
  const [emergencyRelationship, setEmergencyRelationship] = useState(initialEmergencyRelationship ?? '')
  const [emergencyPhone, setEmergencyPhone] = useState(formatPhone(initialEmergencyPhone) ?? '')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const dirty =
    email !== (initialEmail ?? '') ||
    phone !== (formatPhone(initialPhone) ?? '') ||
    emergencyName !== (initialEmergencyName ?? '') ||
    emergencyRelationship !== (initialEmergencyRelationship ?? '') ||
    emergencyPhone !== (formatPhone(initialEmergencyPhone) ?? '')

  async function handleSubmit(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault()
    setSaving(true)
    try {
      await onUpdateProfile({
        email,
        phone,
        emergency_name: emergencyName,
        emergency_relationship: emergencyRelationship,
        emergency_phone: emergencyPhone,
      })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (err) {
      alert(`Save failed: ${err}`)
    }
    setSaving(false)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-sm">
      <div className="space-y-3">
        <div>
          <label className="block text-sm text-zinc-400 mb-1">Email</label>
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="w-full px-3 py-2 bg-zinc-800 border border-zinc-600 rounded text-white placeholder-zinc-500 focus:outline-none focus:border-pr-red"
          />
        </div>
        <div>
          <label className="block text-sm text-zinc-400 mb-1">Phone</label>
          <input
            type="tel"
            value={phone}
            onChange={e => setPhone(e.target.value)}
            placeholder="+1 (555) 000-0000"
            className="w-full px-3 py-2 bg-zinc-800 border border-zinc-600 rounded text-white placeholder-zinc-500 focus:outline-none focus:border-pr-red"
          />
        </div>
      </div>

      <div className="border-t border-zinc-700 pt-5">
        <h3 className="text-sm font-medium text-zinc-300 mb-3">Emergency Contact</h3>
        <div className="space-y-3">
          <div>
            <label className="block text-sm text-zinc-400 mb-1">Name</label>
            <input
              type="text"
              value={emergencyName}
              onChange={e => setEmergencyName(e.target.value)}
              placeholder="Jane Smith"
              className="w-full px-3 py-2 bg-zinc-800 border border-zinc-600 rounded text-white placeholder-zinc-500 focus:outline-none focus:border-pr-red"
            />
          </div>
          <div>
            <label className="block text-sm text-zinc-400 mb-1">Relationship</label>
            <input
              type="text"
              value={emergencyRelationship}
              onChange={e => setEmergencyRelationship(e.target.value)}
              placeholder="Spouse, Parent, Friend…"
              className="w-full px-3 py-2 bg-zinc-800 border border-zinc-600 rounded text-white placeholder-zinc-500 focus:outline-none focus:border-pr-red"
            />
          </div>
          <div>
            <label className="block text-sm text-zinc-400 mb-1">Phone</label>
            <input
              type="tel"
              value={emergencyPhone}
              onChange={e => setEmergencyPhone(e.target.value)}
              placeholder="+1 (555) 000-0000"
              className="w-full px-3 py-2 bg-zinc-800 border border-zinc-600 rounded text-white placeholder-zinc-500 focus:outline-none focus:border-pr-red"
            />
          </div>
        </div>
      </div>

      <button
        type="submit"
        disabled={saving || !dirty}
        className="px-4 py-2 bg-pr-red hover:bg-pr-red-light disabled:opacity-50 text-white rounded font-medium transition-colors"
      >
        {saving ? 'Saving…' : saved ? 'Saved ✓' : 'Save'}
      </button>
    </form>
  )
}
