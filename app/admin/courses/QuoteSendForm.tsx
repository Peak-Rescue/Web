'use client'

import { useState } from 'react'
import AdminCcPicker from '@/components/AdminCcPicker'

/** Sending a quote, with whoever else is being copied on it.
 *
 *  The button used to say "Send to <the client>" whatever was ticked, which
 *  stopped being true the moment a colleague was copied — it read as one
 *  address going to one person while three were about to get it.
 *
 *  It still names the address, because that is the part worth checking before
 *  a quote leaves: a contact often has two on file — the work one and the one
 *  they actually read — and a name would hide which is about to be used. The
 *  copies are counted beside it, so the button describes the whole send.
 */
export default function QuoteSendForm({
  action,
  contactEmail,
  ccOptions,
  adminCcOptions,
}: {
  action: (formData: FormData) => Promise<void>
  contactEmail: string
  ccOptions: string[]
  adminCcOptions: { id: string; name: string; email: string }[]
}) {
  const [copies, setCopies] = useState(0)

  // Counted off the form itself rather than from state per checkbox: the
  // colleague picker owns its own inputs, and both kinds of cc are one answer
  // to one question — who else gets this.
  const count = (form: HTMLFormElement) =>
    setCopies(form.querySelectorAll('input[name="cc_extra"]:checked, input[name="cc_admin"]:checked').length)

  return (
    <form
      action={action}
      onChange={(e) => count(e.currentTarget)}
      className="flex items-center gap-2.5 flex-wrap"
    >
      {ccOptions.map((email) => (
        <label key={email} className="flex items-center gap-1.5 text-xs text-zinc-400 cursor-pointer" title={`Also send a copy to ${email}`}>
          <input type="checkbox" name="cc_extra" value={email} className="accent-pr-red size-3.5" />
          cc {email}
        </label>
      ))}
      <AdminCcPicker admins={adminCcOptions} />
      <button
        title={
          copies === 0
            ? `Sends the quote to ${contactEmail}`
            : `Sends the quote to ${contactEmail}, copying ${copies} other ${copies === 1 ? 'address' : 'addresses'}`
        }
        className="text-xs px-2.5 py-1 bg-pr-red hover:bg-pr-red-dark text-white rounded transition-colors"
      >
        Send to {contactEmail}
        {copies > 0 && <span className="text-white/75"> + {copies} cc</span>}
      </button>
    </form>
  )
}
