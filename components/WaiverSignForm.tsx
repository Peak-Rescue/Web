'use client'

import { useState } from 'react'
import WaiverDocument from '@/components/WaiverDocument'
import SignatureField from '@/components/SignatureField'
import { ADULT_AGE, isMinor, type WaiverBody, type WaiverPrefill } from '@/lib/waiver'

// The act of signing, wherever it happens.
//
// Shared by the portal and the public QR page because the document, the fields
// and the rules must be identical on both — the only honest difference between
// the two is how much we know about who is filling it in, and that is decided
// on the server, not here.

export type WaiverFormValues = WaiverPrefill & {
  initialsImage: string | null
  signatureImage: string
  esignConsent: boolean
  guardian?: {
    firstName: string
    middleName: string
    lastName: string
    phone: string
    dateOfBirth: string
  }
}

export const EMPTY_PREFILL: WaiverPrefill = {
  firstName: '', middleName: '', lastName: '', phone: '', email: '', dateOfBirth: '',
  addressLine1: '', addressLine2: '', city: '', state: '', postalCode: '',
  country: 'United States',
  emergencyFirstName: '', emergencyLastName: '', emergencyPhone: '', emergencyRelationship: '',
}

export default function WaiverSignForm({
  body,
  prefill,
  onSubmit,
  onCancel,
  submitLabel = 'Agree to this document',
}: {
  body: WaiverBody
  prefill: WaiverPrefill
  onSubmit: (values: WaiverFormValues) => Promise<void>
  onCancel?: () => void
  submitLabel?: string
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState<WaiverPrefill>(prefill)
  const [guardian, setGuardian] = useState({
    firstName: '', middleName: '', lastName: '', phone: '', dateOfBirth: '',
  })
  const [initials, setInitials] = useState<string | null>(null)
  const [signature, setSignature] = useState<string | null>(null)
  const [consent, setConsent] = useState(false)

  const set = (k: keyof WaiverPrefill) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }))
  const setG = (k: keyof typeof guardian) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setGuardian((g) => ({ ...g, [k]: e.target.value }))

  const validDob = /^\d{4}-\d{2}-\d{2}$/.test(form.dateOfBirth)
  const minor = validDob && isMinor(form.dateOfBirth)
  const signerName = minor
    ? [guardian.firstName, guardian.lastName].filter(Boolean).join(' ').trim()
    : [form.firstName, form.lastName].filter(Boolean).join(' ').trim()

  const field = 'w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-zinc-500'
  const labelCls = 'block text-xs text-zinc-400 mb-1'

  const ready = Boolean(
    form.firstName.trim() && form.lastName.trim() && form.email.trim() && validDob &&
    signature && consent &&
    (body.initials_after_clause === null || initials) &&
    (!minor || (guardian.firstName.trim() && guardian.lastName.trim() && guardian.dateOfBirth))
  )

  async function submit() {
    setBusy(true)
    setError(null)
    try {
      await onSubmit({
        ...form,
        initialsImage: initials,
        signatureImage: signature ?? '',
        esignConsent: consent,
        guardian: minor ? guardian : undefined,
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That didn’t work — please try again.')
      setBusy(false)
    }
  }

  return (
    <div className="space-y-5">
      <WaiverDocument
        body={body}
        initialsSlot={
          <div className="border-t border-zinc-200 pt-3">
            <p className="text-xs font-medium text-zinc-700 mb-2">Initial here to acknowledge the above</p>
            <div className="max-w-xs">
              <SignatureField kind="initials" tone="light" value={initials} onChange={setInitials} />
            </div>
          </div>
        }
      />

      <div>
        <h4 className="text-sm font-semibold text-zinc-300 mb-3">
          {minor ? 'Participant (the person taking the course)' : 'Your details'}
        </h4>
        <div className="grid sm:grid-cols-3 gap-3">
          <div><label className={labelCls}>First name *</label><input value={form.firstName} onChange={set('firstName')} className={field} /></div>
          <div><label className={labelCls}>Middle name</label><input value={form.middleName} onChange={set('middleName')} className={field} /></div>
          <div><label className={labelCls}>Last name *</label><input value={form.lastName} onChange={set('lastName')} className={field} /></div>
          <div><label className={labelCls}>Phone</label><input value={form.phone} onChange={set('phone')} className={field} /></div>
          <div>
            <label className={labelCls}>Date of birth *</label>
            <input type="date" value={form.dateOfBirth} onChange={set('dateOfBirth')} className={field} />
          </div>
          <div>
            <label className={labelCls}>Email for your copy *</label>
            <input type="email" value={form.email} onChange={set('email')} className={field} />
          </div>
        </div>
      </div>

      {/* Guardian — appears the moment the date of birth says it has to. */}
      {minor && (
        <div className="px-4 py-4 rounded-lg border border-amber-900/70 bg-amber-950/20">
          <h4 className="text-sm font-semibold text-amber-200 mb-2">
            A parent or legal guardian must sign
          </h4>
          {body.guardian_notice.map((line, i) => (
            <p key={i} className="text-xs text-zinc-400 mb-2">{line}</p>
          ))}
          <p className="text-xs text-zinc-400 mb-3">
            This participant is under {ADULT_AGE}, so the signature below must be the parent’s or
            guardian’s — not the participant’s.
          </p>
          <div className="grid sm:grid-cols-3 gap-3">
            <div><label className={labelCls}>Guardian first name *</label><input value={guardian.firstName} onChange={setG('firstName')} className={field} /></div>
            <div><label className={labelCls}>Middle name</label><input value={guardian.middleName} onChange={setG('middleName')} className={field} /></div>
            <div><label className={labelCls}>Guardian last name *</label><input value={guardian.lastName} onChange={setG('lastName')} className={field} /></div>
            <div><label className={labelCls}>Guardian phone</label><input value={guardian.phone} onChange={setG('phone')} className={field} /></div>
            <div>
              <label className={labelCls}>Guardian date of birth *</label>
              <input type="date" value={guardian.dateOfBirth} onChange={setG('dateOfBirth')} className={field} />
            </div>
          </div>
        </div>
      )}

      <div>
        <h4 className="text-sm font-semibold text-zinc-300 mb-3">Emergency contact</h4>
        <div className="grid sm:grid-cols-2 gap-3">
          <div><label className={labelCls}>First name</label><input value={form.emergencyFirstName} onChange={set('emergencyFirstName')} className={field} /></div>
          <div><label className={labelCls}>Last name</label><input value={form.emergencyLastName} onChange={set('emergencyLastName')} className={field} /></div>
          <div><label className={labelCls}>Phone</label><input value={form.emergencyPhone} onChange={set('emergencyPhone')} className={field} /></div>
          <div><label className={labelCls}>Relationship to participant</label><input value={form.emergencyRelationship} onChange={set('emergencyRelationship')} className={field} /></div>
        </div>
      </div>

      <div>
        <h4 className="text-sm font-semibold text-zinc-300 mb-3">Participant address</h4>
        <div className="grid sm:grid-cols-2 gap-3">
          <div className="sm:col-span-2"><label className={labelCls}>Address line 1</label><input value={form.addressLine1} onChange={set('addressLine1')} className={field} /></div>
          <div className="sm:col-span-2"><label className={labelCls}>Address line 2</label><input value={form.addressLine2} onChange={set('addressLine2')} className={field} /></div>
          <div><label className={labelCls}>City</label><input value={form.city} onChange={set('city')} className={field} /></div>
          <div><label className={labelCls}>State / province</label><input value={form.state} onChange={set('state')} className={field} /></div>
          <div><label className={labelCls}>ZIP / postal code</label><input value={form.postalCode} onChange={set('postalCode')} className={field} /></div>
          <div><label className={labelCls}>Country</label><input value={form.country} onChange={set('country')} className={field} /></div>
        </div>
      </div>

      <div>
        <h4 className="text-sm font-semibold text-zinc-300 mb-3">
          {minor ? 'Parent or guardian signature *' : 'Your signature *'}
        </h4>
        <SignatureField value={signature} onChange={setSignature} suggestedText={signerName || undefined} />
      </div>

      <label className="flex gap-3 items-start px-4 py-3 rounded-lg border border-zinc-800 bg-zinc-900 cursor-pointer">
        <input
          type="checkbox"
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
          className="mt-1 shrink-0"
        />
        <span className="text-xs text-zinc-400 leading-relaxed">
          <span className="block text-sm text-zinc-200 font-medium mb-1">Electronic signature consent *</span>
          {body.esign_consent}
        </span>
      </label>

      {error && <p className="text-sm text-pr-red-light">{error}</p>}

      <div className="flex items-center gap-3 flex-wrap">
        <button
          onClick={submit}
          disabled={!ready || busy}
          className="px-5 py-2.5 bg-pr-red hover:bg-pr-red-dark disabled:opacity-40 disabled:cursor-not-allowed text-white rounded text-sm font-medium transition-colors"
        >
          {busy ? 'Signing…' : submitLabel}
        </button>
        {onCancel && (
          <button
            onClick={onCancel}
            disabled={busy}
            className="text-sm text-zinc-400 hover:text-zinc-200 transition-colors"
          >
            Cancel
          </button>
        )}
        {/* Says which requirement is outstanding rather than leaving a disabled
            button to be argued with. */}
        {!ready && !busy && (
          <span className="text-xs text-zinc-500">
            {!validDob ? 'Add your date of birth'
              : minor && !guardian.lastName.trim() ? 'A guardian must complete their details'
              : body.initials_after_clause !== null && !initials ? 'Initial the document above'
              : !signature ? 'Sign above'
              : !consent ? 'Consent to signing electronically'
              : 'Fill in the required fields'}
          </span>
        )}
      </div>
    </div>
  )
}
