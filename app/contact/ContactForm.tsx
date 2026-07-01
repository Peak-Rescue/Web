'use client'

import { useState } from 'react'
import { submitContactForm } from './actions'

const inputClass =
  'bg-pr-surface border border-white/10 text-pr-text px-4 py-3 text-sm placeholder-pr-muted/50 focus:outline-none focus:border-pr-red/50 transition-colors'
const labelClass =
  'text-xs font-display font-600 tracking-widest uppercase text-pr-muted'

export default function ContactForm() {
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = e.currentTarget
    const fd = new FormData(form)
    setState('sending')
    setError('')
    const res = await submitContactForm({
      firstName: String(fd.get('firstName') ?? ''),
      lastName: String(fd.get('lastName') ?? ''),
      email: String(fd.get('email') ?? ''),
      organization: String(fd.get('organization') ?? ''),
      interest: String(fd.get('interest') ?? ''),
      message: String(fd.get('message') ?? ''),
      company_website: String(fd.get('hp_field') ?? ''),
    })
    if (res.ok) {
      setState('sent')
      form.reset()
    } else {
      setState('error')
      setError(res.error)
    }
  }

  if (state === 'sent') {
    return (
      <div className="border border-pr-red/30 bg-pr-surface px-6 py-8">
        <p className="font-display font-700 text-lg text-pr-text uppercase tracking-wide">Message sent ✓</p>
        <p className="mt-2 text-sm text-pr-muted leading-relaxed">
          Thanks for reaching out — we&apos;ll get back to you shortly. For anything urgent, call{' '}
          <a href="tel:+18337372834" className="text-pr-red hover:text-pr-red-light transition-colors">
            (833) 737-2834
          </a>.
        </p>
        <button
          type="button"
          onClick={() => setState('idle')}
          className="mt-6 text-xs font-display font-600 tracking-widest uppercase text-pr-muted hover:text-pr-text transition-colors"
        >
          Send another →
        </button>
      </div>
    )
  }

  const sending = state === 'sending'

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      {/* Honeypot — display:none so real browsers (and their autofill) skip it;
          naive bots that fill every field populate it and get dropped server-side. */}
      <input
        type="text"
        name="hp_field"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        style={{ display: 'none' }}
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        <div className="flex flex-col gap-2">
          <label className={labelClass}>First Name</label>
          <input type="text" name="firstName" required className={inputClass} placeholder="John" />
        </div>
        <div className="flex flex-col gap-2">
          <label className={labelClass}>Last Name</label>
          <input type="text" name="lastName" required className={inputClass} placeholder="Smith" />
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <label className={labelClass}>Email</label>
        <input type="email" name="email" required className={inputClass} placeholder="you@organization.com" />
      </div>

      <div className="flex flex-col gap-2">
        <label className={labelClass}>Organization / Team</label>
        <input type="text" name="organization" className={inputClass} placeholder="Company, unit, or agency name" />
      </div>

      <div className="flex flex-col gap-2">
        <label className={labelClass}>Training Interest</label>
        <select name="interest" className={`${inputClass} appearance-none`} defaultValue="">
          <option value="">Select a program area</option>
          <option value="tactical">Military &amp; Tactical</option>
          <option value="sar">Backcountry &amp; SAR</option>
          <option value="industrial">Industrial &amp; Facilities</option>
          <option value="specialty">Specialty &amp; Commercial</option>
          <option value="custom">Custom / Multiple Programs</option>
          <option value="courses">Online Courses</option>
        </select>
      </div>

      <div className="flex flex-col gap-2">
        <label className={labelClass}>Message</label>
        <textarea
          name="message"
          rows={5}
          required
          className={`${inputClass} resize-none`}
          placeholder="Tell us about your team, your training goals, and any relevant timeline or location details."
        />
      </div>

      {state === 'error' && (
        <p className="text-sm text-pr-red" role="alert">{error}</p>
      )}

      <button
        type="submit"
        disabled={sending}
        className="px-8 py-4 bg-pr-red text-white font-display font-700 text-sm tracking-widest uppercase hover:bg-pr-red-dark transition-colors self-start disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {sending ? 'Sending…' : 'Send Message'}
      </button>
    </form>
  )
}
