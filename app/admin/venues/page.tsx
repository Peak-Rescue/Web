import { redirect } from 'next/navigation'
import { shelfLink } from '@/lib/library'

// Venues had a screen of their own back when a venue was a row with a name
// and a region on it. Everything it offered is on the places shelf now —
// grouped by country and state, with each venue's maps, beta, MEDEVAC plans,
// permits, weather and contacts under it, and Edit → More for the rest.
//
// A redirect rather than a delete: the address is in links, in bookmarks, and
// in the sentence somebody wrote in a comment explaining where venues live.
export default function VenuesPage() {
  redirect(shelfLink('venue').href)
}
