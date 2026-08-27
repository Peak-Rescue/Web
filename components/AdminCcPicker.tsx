'use client'

// Colleagues to copy on a client-facing email. Folded shut, because most sends
// don't need one and a row of names beside the Send button is noise on the
// other days.
//
// It posts addresses rather than ids, and the action checks each one against a
// real admin's address before it goes anywhere — a form value is a claim.
export default function AdminCcPicker({
  admins,
  label = 'cc a colleague',
}: {
  admins: { id: string; name: string; email: string }[]
  label?: string
}) {
  if (admins.length === 0) return null
  return (
    <details className="group inline-block align-middle">
      <summary className="cursor-pointer list-none text-xs text-zinc-500 hover:text-zinc-300 transition-colors">
        <span className="text-zinc-700 mr-1 inline-block transition-transform group-open:rotate-90">▶</span>
        {label}
      </summary>
      <div className="mt-1.5 flex flex-wrap items-center gap-2.5">
        {admins.map((a) => (
          <label
            key={a.id}
            title={`Copy ${a.email} on this email`}
            className="flex items-center gap-1.5 text-xs text-zinc-400 cursor-pointer"
          >
            <input type="checkbox" name="cc_admin" value={a.email} className="accent-pr-red size-3.5" />
            {a.name}
          </label>
        ))}
      </div>
    </details>
  )
}
