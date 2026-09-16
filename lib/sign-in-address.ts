// Which of somebody's addresses actually signs them in.
//
// A staff account can have three addresses on file, and until now nothing said
// which did what:
//
//   auth.users.email     what you type on the login page. The only one that
//                        signs you in, and the only one nothing on any screen
//                        could change.
//   instructors.email    the staff record's address: invites, course alerts,
//                        calendar invites, staffing requests.
//   profiles.email       personal contact: the copy of your expense report,
//                        crew messages, what students see if you share it.
//
// The trap was that the middle and last are editable and the first is not, so
// the field that looks most like "my email" is the one with no effect on
// logging in. This turns that into a choice: the addresses we already hold for
// you, one of them marked as the one that signs you in.
//
// A choice, never free text. Typing an address here would let somebody move
// their own account to a mailbox they cannot open and lock themselves out with
// no way back — and the whole point is that sign-in is the leg with no
// recovery. Every option is an address we already have.

import { type createAdminClient } from '@/lib/supabase/admin'
import { normalizeEmail } from '@/lib/email'
import { refuse, type ActionRefusal } from '@/lib/action-result'

type Admin = ReturnType<typeof createAdminClient>

export type AddressOption = {
  address: string
  /** Why we hold this one — shown beside it, so the choice is informed. */
  role: string
  current: boolean
}

export async function signInAddresses(admin: Admin, userId: string): Promise<AddressOption[]> {
  const [{ data: authUser }, { data: profile }, { data: instructor }] = await Promise.all([
    admin.auth.admin.getUserById(userId),
    admin.from('profiles').select('email').eq('id', userId).maybeSingle(),
    admin.from('instructors').select('email, sign_in_emails').eq('profile_id', userId).maybeSingle(),
  ])

  const current = normalizeEmail(authUser?.user?.email ?? '')
  if (!current) return []

  // Ordered by how likely each is to be the one they meant, and deduplicated
  // by address: the first description of an address wins, so an address that
  // is both the current one and their staff address reads as the current one.
  const candidates: [string, string][] = [
    [current, 'signs you in now'],
    [normalizeEmail(instructor?.email ?? ''), 'your staff address — invites and course alerts'],
    [normalizeEmail(profile?.email ?? ''), 'your contact address — expense copies and crew messages'],
    ...((instructor?.sign_in_emails ?? []) as string[]).map(
      (a) => [normalizeEmail(a), 'another address on your record'] as [string, string]
    ),
  ]

  const seen = new Set<string>()
  const options: AddressOption[] = []
  for (const [address, role] of candidates) {
    if (!address || seen.has(address)) continue
    seen.add(address)
    options.push({ address, role, current: address === current })
  }
  return options
}

/** Moves the account itself. Returns a refusal, or nothing on success. */
export async function setSignInAddress(
  admin: Admin,
  userId: string,
  address: string
): Promise<ActionRefusal | void> {
  const wanted = normalizeEmail(address)
  const options = await signInAddresses(admin, userId)

  const chosen = options.find((o) => o.address === wanted)
  if (!chosen) {
    return refuse('That is not one of the addresses on file for this account. Add it first, then choose it here.')
  }
  if (chosen.current) return

  // Somebody else's account already answers to it. Moving this one would
  // either fail at the database or, worse, quietly contest an address two
  // people can sign in as.
  const { data: holder } = await admin.rpc('auth_user_id_by_email', { addr: wanted })
  if (holder && holder !== userId) {
    return refuse('Another account already signs in with that address. Those two accounts need merging first.')
  }

  // email_confirm because nobody is standing at a mailbox waiting to click:
  // this is a choice made from a list of addresses we already hold, by
  // somebody already signed in.
  const { error } = await admin.auth.admin.updateUserById(userId, {
    email: wanted,
    email_confirm: true,
  })
  if (error) return refuse(`That address could not be set: ${error.message}`)
}
