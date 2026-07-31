'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { checkRateLimit, clientIp } from '@/lib/rate-limit'
import { isLikelyContactSpam } from '@/lib/contact-spam'

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
  if (firstName.length > 120 || lastName.length > 120 || (organization?.length ?? 0) > 200) {
    return { ok: false, error: 'Please shorten your name or organization.' }
  }

  const admin = createAdminClient()

  // This action emails info@ and is reachable by anyone, so cap it per sender
  // and per IP. The reply is deliberately the success message — telling a bot
  // it hit a limit just teaches it the threshold.
  const ip = await clientIp()
  const withinLimits =
    (await checkRateLimit(admin, 'contact', email.toLowerCase(), { limit: 3, windowMinutes: 60 })) &&
    (await checkRateLimit(admin, 'contact_ip', ip, { limit: 10, windowMinutes: 60 }))
  if (!withinLimits) return { ok: true }

  const spam = isLikelyContactSpam({ firstName, lastName, organization, message })

  // Durable capture first — this must succeed for the form to "work".
  const { error } = await admin.from('contact_submissions').insert({
    first_name: firstName,
    last_name: lastName,
    email,
    organization,
    interest,
    message,
    spam,
  })
  if (error) {
    return { ok: false, error: 'Something went wrong. Please email info@peak-rescue.com directly.' }
  }

  // Best-effort notification. If Resend isn't configured (or fails), the
  // submission is already stored, so we never fail the request over email.
  // Spam-flagged submissions stay reviewable in the admin but don't notify.
  if (!spam && process.env.RESEND_API_KEY) {
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
