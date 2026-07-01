'use server'

import { createAdminClient } from '@/lib/supabase/admin'

export type ContactInput = {
  firstName: string
  lastName: string
  email: string
  organization: string
  interest: string
  message: string
  // Honeypot — must stay empty for real users.
  company_website: string
}

export type ContactResult = { ok: true } | { ok: false; error: string }

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export async function submitContactForm(input: ContactInput): Promise<ContactResult> {
  // Bots fill hidden fields; humans don't. Silently accept and drop.
  if (input.company_website?.trim()) return { ok: true }

  const firstName = input.firstName?.trim() ?? ''
  const lastName = input.lastName?.trim() ?? ''
  const email = input.email?.trim() ?? ''
  const message = input.message?.trim() ?? ''
  const organization = input.organization?.trim() || null
  const interest = input.interest?.trim() || null

  if (!firstName || !lastName || !message) {
    return { ok: false, error: 'Please add your name and a message.' }
  }
  if (!EMAIL_RE.test(email)) {
    return { ok: false, error: 'Please enter a valid email address.' }
  }
  if (message.length > 5000) {
    return { ok: false, error: 'That message is a bit too long — please shorten it.' }
  }

  // Durable capture first — this must succeed for the form to "work".
  const { error } = await createAdminClient().from('contact_submissions').insert({
    first_name: firstName,
    last_name: lastName,
    email,
    organization,
    interest,
    message,
  })
  if (error) {
    return { ok: false, error: 'Something went wrong. Please email info@peak-rescue.com directly.' }
  }

  // Best-effort notification. If Resend isn't configured (or fails), the
  // submission is already stored, so we never fail the request over email.
  if (process.env.RESEND_API_KEY) {
    try {
      const { Resend } = await import('resend')
      const resend = new Resend(process.env.RESEND_API_KEY)
      await resend.emails.send({
        from: 'Peak Rescue Website <noreply@peak-rescue.com>',
        to: ['info@peak-rescue.com'],
        replyTo: email,
        subject: `New contact message — ${firstName} ${lastName}`,
        text: [
          `Name:         ${firstName} ${lastName}`,
          `Email:        ${email}`,
          organization ? `Organization: ${organization}` : null,
          interest ? `Interest:     ${interest}` : null,
          '',
          message,
        ].filter(Boolean).join('\n'),
      })
    } catch (e) {
      console.error('Contact email notification failed (submission was still saved):', e)
    }
  }

  return { ok: true }
}
