'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { createClient as createAnonClient } from '@supabase/supabase-js'

export type JoinResult = { ok: true } | { ok: false; error: string }

// Public action — the invite token is the sole gate. Every check the page did
// at render time is repeated here so a stale or forged form can't get through.
export async function joinCourse(
  token: string,
  firstName: string,
  lastName: string,
  email: string
): Promise<JoinResult> {
  const first = firstName.trim()
  const last = lastName.trim()
  const normalizedEmail = email.trim().toLowerCase()

  if (!first || !last) return { ok: false, error: 'Please enter your first and last name.' }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    return { ok: false, error: 'Please enter a valid email address.' }
  }
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(token)) {
    return { ok: false, error: 'This invite link is not valid.' }
  }

  const admin = createAdminClient()

  const { data: inst } = await admin
    .from('course_instances')
    .select('id, max_students, invite_expires_at')
    .eq('invite_token', token)
    .maybeSingle()

  if (!inst) return { ok: false, error: 'This invite link is not valid. It may have been revoked — check with your course organizer.' }
  if (inst.invite_expires_at && new Date(inst.invite_expires_at).getTime() < Date.now()) {
    return { ok: false, error: 'This invite link has expired. Contact your course organizer for a new one.' }
  }

  if (inst.max_students) {
    const { count } = await admin
      .from('enrollments')
      .select('id', { count: 'exact', head: true })
      .eq('instance_id', inst.id)
    if ((count ?? 0) >= inst.max_students) {
      return { ok: false, error: 'This course is full. Contact your course organizer.' }
    }
  }

  const enroll = async (userId: string) => {
    const { error } = await admin
      .from('enrollments')
      .upsert(
        { instance_id: inst.id, user_id: userId },
        { onConflict: 'instance_id,user_id', ignoreDuplicates: true }
      )
    if (error) throw new Error(error.message)
  }

  const sendSignInLink = async () => {
    const anon = createAnonClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { flowType: 'implicit' } }
    )
    await anon.auth.signInWithOtp({
      email: normalizedEmail,
      options: {
        emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/confirm`,
        shouldCreateUser: false,
      },
    })
  }

  try {
    // Must land on /auth/confirm (browser-side): invite links carry the
    // session in the URL hash, which the /auth/callback server route can't
    // see — it would bounce the new student to the login page. Names travel
    // via user metadata (the signup trigger writes them to the profile).
    const { data, error } = await admin.auth.admin.inviteUserByEmail(normalizedEmail, {
      redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/confirm`,
      data: { first_name: first, last_name: last },
    })

    if (!error) {
      await enroll(data.user.id)
      return { ok: true }
    }

    if (!error.message.includes('already been registered')) {
      console.error('joinCourse invite failed:', error.message)
      return { ok: false, error: 'Something went wrong creating your account. Please try again.' }
    }

    // Returning student (or instructor) who already has an account: enroll the
    // existing user and send a plain sign-in link instead of an invite. Their
    // existing profile name is left untouched.
    const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
      type: 'magiclink',
      email: normalizedEmail,
      options: { redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/confirm` },
    })
    if (linkError || !linkData?.user?.id) {
      console.error('joinCourse existing-user lookup failed:', linkError?.message)
      return { ok: false, error: 'Something went wrong. Please try again.' }
    }

    await enroll(linkData.user.id)
    await sendSignInLink()
    return { ok: true }
  } catch (err) {
    console.error('joinCourse failed:', err instanceof Error ? err.message : err)
    return { ok: false, error: 'Something went wrong. Please try again.' }
  }
}
