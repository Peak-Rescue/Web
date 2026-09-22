// Every email in the app goes out through here.
//
// The Resend SDK takes no abort signal, so a stalled send has no ceiling of
// its own: it holds the server action open until the platform kills it. This
// wraps the send in one, and reports a timeout the same way Resend reports a
// rejection — as a returned error, never a throw — so callers keep the error
// handling they already have.

import type {
  CreateBatchEmailOptions,
  CreateBatchRequestOptions,
  CreateBatchResponse,
  CreateEmailOptions,
  CreateEmailResponse,
} from 'resend'
import { withTimeout } from '@/lib/timeout'

// Roomier than the default: receipts and signed waivers ride this path as PDF
// attachments, and those uploads are legitimately slower than a text body.
export const MAIL_TIMEOUT_MS = 15_000

// Local dev sends through the same Resend account as production, so without
// this every expense report, course notice and staffing email tested locally
// would reach the real recipient. Set MAIL_DEV_REDIRECT_TO and they all land
// in one inbox instead, subject-tagged with who they were addressed to.
// Guarded on NODE_ENV: production must never redirect, whatever is set.
// Typed on the four fields it actually touches, so one letter and a batch of
// them can share it — the batch payload is a letter without attachments, and
// the two don't otherwise line up as types.
type Addressed = {
  to?: string | string[]
  cc?: string | string[]
  bcc?: string | string[]
  subject?: string
}
function redirectInDev<T extends Addressed>(payload: T): T {
  const inbox = process.env.MAIL_DEV_REDIRECT_TO
  if (!inbox || process.env.NODE_ENV === 'production') return payload

  const original = [payload.to, payload.cc, payload.bcc].flat().filter(Boolean).join(', ')
  return {
    ...payload, to: [inbox], cc: undefined, bcc: undefined,
    subject: `[dev → ${original}] ${payload.subject}`,
  }
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

// One request for a whole list, where the list is the same letter addressed
// differently — the staffing call-out, and anything else that reaches a room
// rather than a person.
//
// Sending those one at a time meant a round trip each, in series, on a click
// somebody was waiting on: twenty instructors was twenty sends nobody could
// hurry. Resend takes up to a hundred in one call, and the account's limit is
// ten requests a second, so the whole room now costs a single request.
//
// Attachments are the one thing the batch endpoint won't carry. Nothing that
// uses this sends any, and a caller that needs them wants sendMail in a loop
// — which is what it would be doing anyway.
export const MAX_BATCH = 100

type BatchResponse = CreateBatchResponse<CreateBatchRequestOptions>

export async function sendMailBatch(
  payloads: CreateBatchEmailOptions[],
  { timeoutMs = MAIL_TIMEOUT_MS, label = 'resend batch' }: { timeoutMs?: number; label?: string } = {}
): Promise<BatchResponse> {
  if (!process.env.RESEND_API_KEY) return failedBatch('RESEND_API_KEY missing')
  if (payloads.length > MAX_BATCH) return failedBatch(`Batch of ${payloads.length} exceeds Resend's limit of ${MAX_BATCH}`)

  try {
    const { Resend } = await import('resend')
    const resend = new Resend(process.env.RESEND_API_KEY)
    // Every letter goes through the dev redirect on its own, so a local test
    // of a twenty-person call-out lands twenty times in the one inbox rather
    // than reaching twenty real instructors.
    return await withTimeout(label, resend.batch.send(payloads.map(redirectInDev)), timeoutMs)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`${label} failed:`, message)
    return failedBatch(message)
  }
}

function failedBatch(message: string): BatchResponse {
  return { data: null, error: { name: 'application_error', message, statusCode: null }, headers: null }
}
