import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { webhookSignatureValid } from '@/lib/square'
import { settleOrder } from '@/lib/payments'

// Square's notification that something happened to a payment. Subscribe to
// `payment.created` and `payment.updated` at the URL in SQUARE_WEBHOOK_URL.
//
// The body is used only to learn which order to look at; whether it is paid is
// asked of Square itself (see settledPaymentForOrder). The signature check
// still comes first, so nobody can make us call Square on their schedule.
export async function POST(request: Request) {
  const raw = await request.text()
  const notificationUrl =
    process.env.SQUARE_WEBHOOK_URL || `${process.env.NEXT_PUBLIC_SITE_URL || 'https://peak-rescue.com'}/api/square/webhook`
  if (!webhookSignatureValid(raw, request.headers.get('x-square-hmacsha256-signature'), notificationUrl)) {
    return new Response('Bad signature', { status: 401 })
  }

  let orderId: string | undefined
  try {
    const event = JSON.parse(raw) as { data?: { object?: { payment?: { order_id?: string } } } }
    orderId = event.data?.object?.payment?.order_id
  } catch {
    return new Response('Bad body', { status: 400 })
  }
  if (!orderId) return new Response('ok')

  try {
    const result = await settleOrder(createAdminClient(), orderId)
    if (result === 'completed') {
      revalidatePath('/admin/billing')
      revalidatePath('/admin/courses')
    }
  } catch (e) {
    // A 500 makes Square retry, which is what we want if Square itself was
    // briefly unreachable from here.
    console.error('Square webhook failed:', e)
    return new Response('Error', { status: 500 })
  }
  return new Response('ok')
}
