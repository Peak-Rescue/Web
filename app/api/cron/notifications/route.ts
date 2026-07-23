import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { runCertSweep, runHoursReminders } from '@/lib/notifications'

// Daily reminder sweep, hit by the scheduled GitHub Action (see
// .github/workflows/reminder-emails.yml). Both jobs dedupe via
// notification_log, so extra invocations are harmless.
export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = createAdminClient()
  const [certs, hours] = await Promise.all([runCertSweep(admin), runHoursReminders(admin)])
  return NextResponse.json({ certs, hours })
}
