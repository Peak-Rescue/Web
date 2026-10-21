import 'server-only'
import { createHmac, timingSafeEqual } from 'node:crypto'

// Square, spoken to over its REST API.
//
// Hosted checkout only: we make a payment link for an exact amount and send
// the client to Square's own page, which takes the card (and Apple/Google
// Pay). No card number ever reaches this server, which keeps us out of PCI
// scope entirely.
//
// Configured by four env vars. Without the first two the pay button simply
// does not appear, so a preview deploy with no Square keys is a portal that
// takes no cards rather than one that breaks.
//   SQUARE_ACCESS_TOKEN           — the application's access token
//   SQUARE_LOCATION_ID            — which Square location the money lands in
//   SQUARE_ENVIRONMENT            — 'sandbox' for test cards; anything else is live
//   SQUARE_WEBHOOK_SIGNATURE_KEY  — from the webhook subscription

const SQUARE_VERSION = '2025-01-23'

export const squareConfigured = () =>
  Boolean(process.env.SQUARE_ACCESS_TOKEN && process.env.SQUARE_LOCATION_ID)

const baseUrl = () =>
  process.env.SQUARE_ENVIRONMENT === 'sandbox'
    ? 'https://connect.squareupsandbox.com'
    : 'https://connect.squareup.com'

async function square<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const res = await fetch(`${baseUrl()}${path}`, {
    method: init?.method ?? 'GET',
    headers: {
      Authorization: `Bearer ${process.env.SQUARE_ACCESS_TOKEN}`,
      'Square-Version': SQUARE_VERSION,
      'Content-Type': 'application/json',
    },
    body: init?.body === undefined ? undefined : JSON.stringify(init.body),
    cache: 'no-store',
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) {
    const detail = (json as { errors?: { detail?: string }[] }).errors?.[0]?.detail ?? res.statusText
    throw new Error(`Square ${path}: ${detail}`)
  }
  return json as T
}

type Money = { amount: number; currency: string }

export const toCents = (dollars: number) => Math.round(dollars * 100)
const toDollars = (m: Money | undefined) => (m ? m.amount / 100 : 0)

/** A checkout page for one fixed amount. `idempotencyKey` is our payments
    row's id, so a double-click makes one link, not two. */
export async function createPaymentLink(input: {
  idempotencyKey: string
  name: string
  amount: number
  redirectUrl: string
  note: string
  buyerEmail?: string | null
}): Promise<{ id: string; url: string; orderId: string }> {
  const { payment_link } = await square<{ payment_link: { id: string; url: string; order_id: string } }>(
    '/v2/online-checkout/payment-links',
    {
      method: 'POST',
      body: {
        idempotency_key: input.idempotencyKey,
        quick_pay: {
          name: input.name.slice(0, 255),
          price_money: { amount: toCents(input.amount), currency: 'USD' },
          location_id: process.env.SQUARE_LOCATION_ID,
        },
        checkout_options: { redirect_url: input.redirectUrl, ask_for_shipping_address: false },
        payment_note: input.note.slice(0, 500),
        ...(input.buyerEmail ? { pre_populated_data: { buyer_email: input.buyerEmail } } : {}),
      },
    }
  )
  return { id: payment_link.id, url: payment_link.url, orderId: payment_link.order_id }
}

export type SettledPayment = {
  paymentId: string
  amountPaid: number
  receiptUrl: string | null
  payerEmail: string | null
  paidAt: string
}

/** Whether an order has been paid in full, asked of Square directly.

    The webhook only ever tells us which order to look at; the answer always
    comes from here. That way a forged or replayed notification can at worst
    make us ask Square a question, and the client returning from checkout can
    settle the payment even if the webhook is late or was never set up. */
export async function settledPaymentForOrder(orderId: string): Promise<SettledPayment | null> {
  const { order } = await square<{
    order: { net_amount_due_money?: Money; tenders?: { payment_id?: string }[] }
  }>(`/v2/orders/${encodeURIComponent(orderId)}`)
  const paymentId = order.tenders?.find((t) => t.payment_id)?.payment_id
  if (!paymentId) return null
  if (order.net_amount_due_money && order.net_amount_due_money.amount > 0) return null

  const { payment } = await square<{
    payment: {
      id: string
      status: string
      amount_money: Money
      receipt_url?: string
      buyer_email_address?: string
      updated_at: string
    }
  }>(`/v2/payments/${encodeURIComponent(paymentId)}`)
  if (payment.status !== 'COMPLETED') return null

  return {
    paymentId: payment.id,
    amountPaid: toDollars(payment.amount_money),
    receiptUrl: payment.receipt_url ?? null,
    payerEmail: payment.buyer_email_address ?? null,
    paidAt: payment.updated_at,
  }
}

/** Square signs each notification with HMAC-SHA256 over the subscription's
    URL followed by the raw body. The URL has to be exactly the one entered on
    the subscription, which is why it is configurable rather than worked out
    from the request (a proxy can change the host we see). */
export function webhookSignatureValid(rawBody: string, signature: string | null, notificationUrl: string): boolean {
  const key = process.env.SQUARE_WEBHOOK_SIGNATURE_KEY
  if (!key || !signature) return false
  const expected = createHmac('sha256', key).update(notificationUrl + rawBody).digest()
  const given = Buffer.from(signature, 'base64')
  return given.length === expected.length && timingSafeEqual(given, expected)
}
