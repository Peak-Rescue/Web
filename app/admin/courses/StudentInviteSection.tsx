import StudentInvitePanel from './StudentInvitePanel'

// The invite link and the code that stands in for it.
//
// A server component so the QR is drawn where the token already is, rather
// than shipping a rendering library to every browser that opens a course. The
// panel underneath it is the client half — copying, and the buttons that mint
// and kill the token.
//
// Rendered both inside the admin roster editor and, on its own, for the
// instructors standing at the trailhead: a student who never signed up is a
// problem at the meeting point, which is exactly where the admin isn't.
export default async function StudentInviteSection({
  instanceId,
  inviteToken,
  inviteExpiresAt,
}: {
  instanceId: string
  inviteToken: string | null
  inviteExpiresAt: string | null
}) {
  const inviteUrl = inviteToken ? `${process.env.NEXT_PUBLIC_SITE_URL}/join/${inviteToken}` : null
  const inviteQrSvg = inviteUrl
    ? await import('qrcode').then((m) => m.default.toString(inviteUrl, { type: 'svg', margin: 1, width: 148 }))
    : null

  return (
    <StudentInvitePanel
      instanceId={instanceId}
      inviteUrl={inviteUrl}
      inviteQrSvg={inviteQrSvg}
      expiresAt={inviteExpiresAt}
      expired={!!inviteExpiresAt && new Date(inviteExpiresAt) < new Date()}
    />
  )
}
