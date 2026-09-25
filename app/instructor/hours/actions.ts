'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { PAY_CODES, type PayCode } from '@/lib/paycodes'
import { type TimesheetRow } from '@/lib/timesheet'

// The page is gated on the same column, but a server action is its own door.
async function requireTimesheetOwner() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const admin = createAdminClient()
  const { data: instructor } = await admin
    .from('instructors')
    .select('id, hours_via_admin')
    .eq('profile_id', user.id)
    .maybeSingle()
  if (!instructor?.hours_via_admin) throw new Error('Not authorized')
  return { admin, instructorId: instructor.id }
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

// Rows arrive from a form the person has been typing in, so they are checked
// rather than trusted: a bad date or an unknown code would reach Micah as a
// line he cannot key in, and he would have to come back and ask.
function clean(rows: TimesheetRow[]): TimesheetRow[] {
  if (!Array.isArray(rows)) throw new Error('Nothing to save')
  if (rows.length > 60) throw new Error('That is more rows than a pay period can hold')
  const codes = new Set(PAY_CODES.map((c: PayCode) => c.code))
  return rows.map((r) => {
    if (!ISO_DATE.test(r.date)) throw new Error(`"${r.date}" is not a date`)
    if (!codes.has(r.code)) throw new Error(`${r.code} is not a code in the handbook`)
    const hours = Number(r.hours)
    if (!(hours > 0 && hours <= 24)) throw new Error(`${hours} is not a number of hours in a day`)
    return {
      date: r.date,
      hours,
      code: r.code,
      state: String(r.state ?? '').trim().toUpperCase().slice(0, 2),
      note: String(r.note ?? '').slice(0, 200),
    }
  })
}

export async function saveTimesheet(
  periodStart: string,
  periodEnd: string,
  rows: TimesheetRow[]
): Promise<void> {
  const { admin, instructorId } = await requireTimesheetOwner()
  if (!ISO_DATE.test(periodStart) || !ISO_DATE.test(periodEnd)) throw new Error('Bad pay period')

  const { error } = await admin.from('timesheets').upsert(
    {
      instructor_id: instructorId,
      period_start: periodStart,
      period_end: periodEnd,
      rows: clean(rows),
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'instructor_id,period_start' }
  )
  if (error) throw new Error(error.message)
  revalidatePath('/instructor/hours')
}

// Recorded on the person's say-so: the mail leaves from their own inbox, so
// the portal never sees it go. It is a note to self about which periods are
// dealt with, and nothing downstream reads it.
export async function markTimesheetSent(periodStart: string): Promise<void> {
  const { admin, instructorId } = await requireTimesheetOwner()
  const { error } = await admin
    .from('timesheets')
    .update({ sent_at: new Date().toISOString() })
    .eq('instructor_id', instructorId)
    .eq('period_start', periodStart)
  if (error) throw new Error(error.message)
  revalidatePath('/instructor/hours')
}
