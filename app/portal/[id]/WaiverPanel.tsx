'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import WaiverSignForm from '@/components/WaiverSignForm'
import type { SignedWaiver, WaiverBody, WaiverPrefill } from '@/lib/waiver'
import { signWaiver } from './waiver-actions'

// The student's own waiver for one course: signed, or the form to sign it.
//
// The form itself is shared with the public QR page — the document and the
// rules must be the same wherever someone signs. What differs is only what
// surrounds it: here we know who they are, so it arrives prefilled and the
// signature binds to their account.
//
// Prefilled from their profile and their last waiver, because a returning
// student has typed all of this before and retyping a date of birth every
// course is how you train people to rush a legal document. The two things
// never prefilled are the initials and the signature — a mark carried over
// from last year isn't evidence of anything about this year.

export default function WaiverPanel({
  instanceId,
  body,
  templateName,
  prefill,
  signed,
}: {
  instanceId: string
  body: WaiverBody
  templateName: string
  prefill: WaiverPrefill
  signed: SignedWaiver | null
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)

  if (signed) {
    const when = new Date(signed.signedAt).toLocaleDateString('en-US', {
      year: 'numeric', month: 'long', day: 'numeric',
    })
    return (
      <div className="flex items-start gap-3 px-4 py-3 rounded-lg border border-teal-900 bg-teal-950/30">
        <span className="text-teal-400 mt-0.5">✓</span>
        <div className="min-w-0">
          <p className="text-sm text-teal-200">{signed.templateName} signed</p>
          <p className="text-xs text-zinc-400 mt-0.5">
            {signed.signerRole === 'guardian' && signed.guardianName
              ? `Signed by ${signed.guardianName} for ${signed.name}`
              : `Signed by ${signed.name}`}{' '}
            on {when}. Nothing else to do.
          </p>
          <a
            href={`/api/waivers/${signed.id}/pdf`}
            target="_blank"
            rel="noreferrer"
            className="inline-block mt-2 text-xs text-teal-300 hover:text-teal-100 underline transition-colors"
          >
            Download your copy
          </a>
        </div>
      </div>
    )
  }

  if (!open) {
    return (
      <div className="px-4 py-4 rounded-lg border border-amber-900/70 bg-amber-950/20">
        <p className="text-sm text-amber-200 font-medium">Your waiver isn’t signed yet</p>
        <p className="text-xs text-zinc-400 mt-1 mb-3">
          {templateName} — everyone on the course signs before the first day. Takes a minute.
        </p>
        <button
          onClick={() => setOpen(true)}
          className="px-4 py-2 bg-pr-red hover:bg-pr-red-dark text-white rounded text-sm font-medium transition-colors"
        >
          Read and sign
        </button>
      </div>
    )
  }

  return (
    <WaiverSignForm
      body={body}
      prefill={prefill}
      onCancel={() => setOpen(false)}
      onSubmit={async (values) => {
        await signWaiver(instanceId, values)
        router.refresh()
      }}
    />
  )
}
