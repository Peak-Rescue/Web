import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { runCalendarDriftSweep, runCertSweep, runHoursReminders } from '@/lib/notifications'

// Daily sweep, hit by the scheduled GitHub Action (see
// .github/workflows/reminder-emails.yml): medical-cert gaps, ADP hours
// reminders, and the Google Calendar mirror check, which repairs any course
// event that has drifted and emails the admins about what it had to fix.
// Every job dedupes via notification_log, so extra invocations are harmless.
export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = createAdminClient()
  const [certs, hours, calendar] = await Promise.all([
    runCertSweep(admin),
    runHoursReminders(admin),
    runCalendarDriftSweep(admin),
  ])
  return NextResponse.json({ certs, hours, calendar })
}
