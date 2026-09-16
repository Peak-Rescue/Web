'use server'

import { revalidatePath } from 'next/cache'
import { requireAdminUser } from '@/lib/course-access'
import { tableFromCsv } from '@/lib/csv'
import { mapRows, withFingerprints, type ColumnMap } from '@/lib/card-import'

// Writes for the company card's statement. Admin-only like the rest of the
// money: requireAdminUser gates every one, because a server action is callable
// directly and the page's own gate protects nothing.

function revalidateCard(instanceId?: string | null) {
  revalidatePath('/admin/expenses/card')
  if (instanceId) revalidatePath(`/portal/${instanceId}`)
}

/** Imports a file that a person has already seen mapped on screen.

    The text and the mapping come back rather than the parsed rows: the same
    pure functions that drew the preview do the parsing here, so what is
    written is what was shown, and a client that sent doctored rows could not
    change the outcome. */
export async function importCardCharges(input: {
  text: string
  sourceName: string
  map: ColumnMap
  flipSign: boolean
  dayFirst: boolean
}): Promise<{ imported: number; skipped: number; rejected: number; batchId: string }> {
  const { admin, user } = await requireAdminUser()

  const table = tableFromCsv(input.text)
  if (!table) throw new Error('There was nothing to read in that file')
  const { rows, rejected } = mapRows(table, input.map, { flipSign: input.flipSign, dayFirst: input.dayFirst })
  if (rows.length === 0) throw new Error('No row in that file had both a date and an amount')

  const fingerprinted = withFingerprints(rows)

  // What is already in the books. Statements overlap — a September export
  // pulled twice in a month is the normal case, not the exception — so a
  // charge already here is skipped and counted, never inserted again.
  const { data: existingRows } = await admin
    .from('card_charges')
    .select('fingerprint')
    .in('fingerprint', fingerprinted.map((r) => r.fingerprint))
  const existing = new Set((existingRows ?? []).map((r) => r.fingerprint as string))
  const fresh = fingerprinted.filter((r) => !existing.has(r.fingerprint))

  const { data: batch, error: batchError } = await admin
    .from('card_import_batches')
    .insert({
      imported_by: user.id,
      source_name: input.sourceName.slice(0, 120) || 'Pasted',
      row_count: fresh.length,
      skipped_count: fingerprinted.length - fresh.length,
    })
    .select('id')
    .single()
  if (batchError || !batch) throw new Error(batchError?.message ?? 'Could not start that import')

  if (fresh.length > 0) {
    const { error } = await admin.from('card_charges').insert(
      fresh.map((r) => ({
        batch_id: batch.id,
        posted_date: r.posted_date,
        description: r.description.slice(0, 300),
        amount: r.amount,
        cardholder: r.cardholder?.slice(0, 120) ?? null,
        raw: r.raw,
        fingerprint: r.fingerprint,
      }))
    )
    if (error) throw new Error(error.message)
  }

  revalidateCard()
  return {
    imported: fresh.length,
    skipped: fingerprinted.length - fresh.length,
    rejected: rejected.length,
    batchId: batch.id as string,
  }
}

/** Says which course a charge belongs to — or that it deliberately belongs to
    none, which is a different answer from silence and is stored as one.

    Nothing is copied into the course. The charge stays the only record of
    itself and the course reads it live, so answering this again next week
    moves the money rather than leaving a stale copy behind. */
export async function tagCharge(
  chargeId: string,
  input: { instanceId: string | null; nonCourse: boolean; accountId?: string | null }
) {
  const { admin } = await requireAdminUser()

  // Which course it was, so that course's page stops showing it too.
  const { data: before } = await admin.from('card_charges').select('instance_id').eq('id', chargeId).maybeSingle()

  const patch: Record<string, unknown> = {
    instance_id: input.instanceId,
    // A charge cannot be both somebody's course and deliberately nobody's.
    non_course: input.instanceId ? false : input.nonCourse,
  }
  if (input.accountId !== undefined) patch.account_id = input.accountId

  const { error } = await admin.from('card_charges').update(patch).eq('id', chargeId)
  if (error) throw new Error(error.message)

  revalidateCard(input.instanceId)
  if (before?.instance_id && before.instance_id !== input.instanceId) {
    revalidatePath(`/portal/${before.instance_id}`)
  }
}

/** The same answer for every charge from one merchant. A card's statement
    repeats itself — nine nights at the same hotel is nine rows — and tagging
    them one at a time is the reason a statement goes untagged. */
export async function tagChargesLike(
  description: string,
  input: { instanceId: string | null; nonCourse: boolean; accountId?: string | null }
): Promise<number> {
  const { admin } = await requireAdminUser()
  const like = description.trim()
  if (!like) throw new Error('That charge has nothing to match on')
  // A merchant name is a pattern to ilike, not a string: "SHELL 100% CAR
  // WASH" would otherwise match everything from SHELL onwards. Escaped, so
  // the match is exactly the description a person was looking at.
  const pattern = like.replace(/([\\%_])/g, '\\$1')

  const patch: Record<string, unknown> = {
    instance_id: input.instanceId,
    non_course: input.instanceId ? false : input.nonCourse,
  }
  if (input.accountId !== undefined) patch.account_id = input.accountId

  // Only the ones nobody has answered for. A charge already filed against a
  // course was filed by a person who had a reason, and a bulk action on a
  // merchant name must not overrule them.
  const { data, error } = await admin
    .from('card_charges')
    .update(patch)
    .ilike('description', pattern)
    .is('instance_id', null)
    .eq('non_course', false)
    .select('id')
  if (error) throw new Error(error.message)

  revalidateCard(input.instanceId)
  return (data ?? []).length
}

/** Throws away an import, charges and all. The answer to a file imported with
    the columns mapped wrong: every row of it is wrong the same way, and
    correcting them one at a time is worse than importing the file again.

    Refuses once any of its charges have been tagged — by then somebody's
    reconciliation is built on them, and re-importing would not bring their
    answers back. */
export async function deleteCardBatch(batchId: string) {
  const { admin } = await requireAdminUser()
  const { count } = await admin
    .from('card_charges')
    .select('id', { count: 'exact', head: true })
    .eq('batch_id', batchId)
    .or('instance_id.not.is.null,non_course.eq.true')
  if ((count ?? 0) > 0) {
    throw new Error('Some of those charges are already filed against a course — untag them first')
  }
  const { error } = await admin.from('card_import_batches').delete().eq('id', batchId)
  if (error) throw new Error(error.message)
  revalidateCard()
}
