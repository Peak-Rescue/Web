'use client'

import { useRouter } from 'next/navigation'
import ContactList, { type Contact } from '@/components/ContactList'
import { savePlaceContacts, type PlaceScope } from './actions'

// A place's people, edited where they are kept.
//
// They could be added from a course and removed here, and nothing in
// between: a number typed wrong stayed wrong unless you deleted the person
// and typed them again. Same list component the client's people use, so the
// correction is the same gesture wherever somebody was filed.
export default function PlaceContacts({
  scope,
  contacts,
}: {
  scope: PlaceScope
  contacts: Contact[]
}) {
  const router = useRouter()
  return (
    <ContactList
      contacts={contacts}
      rolePlaceholder="Ranger district, landowner…"
      addLabel="+ Add a contact"
      onSave={async (next) => {
        await savePlaceContacts(scope, next)
        router.refresh()
      }}
    />
  )
}
