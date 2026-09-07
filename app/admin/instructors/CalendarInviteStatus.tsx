import InfoHint from '@/components/InfoHint'

// Whether this person gets Google Calendar invites for their courses — read
// only, like the course alerts below it.
//
// It used to be a button any admin could flip for anyone. The argument for
// that was that changing it leaves a visible trace, unlike a notification
// preference; the argument is wrong. Turning somebody's invites *off* is
// exactly as quiet as narrowing their alerts — their calendar simply stops
// filling in and they never learn why. Both rows are theirs to set on their
// own profile and ours to read here.
//
// The one thing this costs: an admin can no longer fix "I'm seeing every
// course twice" on the spot for someone who reports it. That is one click on
// their own profile, and worth the trade for two rows that behave alike.

export default function CalendarInviteStatus({ invited }: { invited: boolean }) {
  return (
    <div className="flex items-center justify-between px-4 py-3 bg-zinc-900 border border-zinc-800 rounded-lg">
      <div className="flex items-center gap-1.5">
        <p className="text-sm font-medium">Google Calendar invites</p>
        <InfoHint text="One invitation per course they're staffed on. They turn it off on their own profile if they already subscribe to the course calendars, or their courses show up twice. Portal emails are unaffected." />
      </div>
      <p className={`shrink-0 text-xs ${invited ? 'text-zinc-400' : 'text-amber-300'}`}>
        {invited ? 'Invited' : 'Not invited'}
      </p>
    </div>
  )
}
