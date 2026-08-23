'use client'

import { useState } from 'react'
import WaiverSignForm, { EMPTY_PREFILL } from '@/components/WaiverSignForm'
import type { WaiverBody } from '@/lib/waiver'
import { signWaiverPublicly } from './actions'

// Signing without an account, from the QR code an instructor is holding up.
//
// Nothing here is prefilled and nothing is looked up before they type: the
// page has no idea who is holding the phone, and pretending otherwise — by
// listing the roster to pick from, say — would put the students' names on a
// public URL to save one person some typing.

export default function PublicWaiver({
  token,
  body,
  courseTitle,
  courseSubtitle,
  templateName,
}: {
  token: string
  body: WaiverBody
  courseTitle: string
  courseSubtitle: string | null
  templateName: string
}) {
  const [done, setDone] = useState<{ linked: boolean } | null>(null)

  if (done) {
    return (
      <div className="px-5 py-6 rounded-lg border border-teal-900 bg-teal-950/30">
        <p className="text-base text-teal-200 font-medium mb-1">Signed — thank you</p>
        <p className="text-sm text-zinc-300">
          A copy is on its way to the email address you gave us. Keep it: you signed without a
          portal account, so that email is your record until one is set up for you.
        </p>
        {!done.linked && (
          <p className="text-xs text-zinc-400 mt-3">
            We couldn’t match you to the course roster automatically, so your instructor will
            confirm who you are. Your waiver is signed and valid either way — there’s nothing more
            for you to do.
          </p>
        )}
      </div>
    )
  }

  return (
    <>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">{courseTitle}</h1>
        {courseSubtitle && <p className="text-sm text-zinc-400 mt-1">{courseSubtitle}</p>}
        <p className="text-sm text-zinc-300 mt-3">
          Before taking part you need to read and sign the {templateName}.
        </p>
        <p className="text-xs text-zinc-500 mt-1">
          If you already have a Peak Rescue portal login, sign in and use your course page instead —
          it prefills your details and ties the waiver straight to your enrollment.
        </p>
      </div>

      <WaiverSignForm
        body={body}
        prefill={EMPTY_PREFILL}
        onSubmit={async (values) => {
          const result = await signWaiverPublicly(token, values)
          setDone({ linked: result.linked })
        }}
      />
    </>
  )
}
