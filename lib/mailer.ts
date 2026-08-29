// Every email in the app goes out through here.
//
// The Resend SDK takes no abort signal, so a stalled send has no ceiling of
// its own: it holds the server action open until the platform kills it. This
// wraps the send in one, and reports a timeout the same way Resend reports a
// rejection — as a returned error, never a throw — so callers keep the error
// handling they already have.

import type { CreateEmailOptions, CreateEmailResponse } from 'resend'
import { withTimeout } from '@/lib/timeout'

// Roomier than the default: receipts and signed waivers ride this path as PDF
// attachments, and those uploads are legitimately slower than a text body.
export const MAIL_TIMEOUT_MS = 15_000

// Local dev sends through the same Resend account as production, so without
// this every expense report, course notice and staffing email tested locally
// would reach the real recipient. Set MAIL_DEV_REDIRECT_TO and they all land
// in one inbox instead, subject-tagged with who they were addressed to.
// Guarded on NODE_ENV: production must never redirect, whatever is set.
function redirectInDev(payload: CreateEmailOptions): CreateEmailOptions {
  const inbox = process.env.MAIL_DEV_REDIRECT_TO
  if (!inbox || process.env.NODE_ENV === 'production') return payload

  const original = [payload.to, payload.cc, payload.bcc].flat().filter(Boolean).join(', ')
  return { ...payload, to: [inbox], cc: undefined, bcc: undefined, subject: `[dev → ${original}] ${payload.subject}` }
}

function failed(message: string): CreateEmailResponse {
  return { data: null, error: { name: 'application_error', message, statusCode: null }, headers: null }
}

export async function sendMail(
  payload: CreateEmailOptions,
  { timeoutMs = MAIL_TIMEOUT_MS, label = 'resend send' }: { timeoutMs?: number; label?: string } = {}
): Promise<CreateEmailResponse> {
  if (!process.env.RESEND_API_KEY) return failed('RESEND_API_KEY missing')

  try {
    const { Resend } = await import('resend')
    const resend = new Resend(process.env.RESEND_API_KEY)
    return await withTimeout(label, resend.emails.send(redirectInDev(payload)), timeoutMs)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`${label} failed:`, message)
    return failed(message)
  }
}
