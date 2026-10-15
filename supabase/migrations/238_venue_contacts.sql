-- Who to ring about a venue, and which of its links is the weather.
--
-- A venue holds four kinds of thing, and until now it held one of them: a flat
-- list of links. Maps live on the library rows filed to the place, beta is the
-- route write-ups filed the same way, and those two sort themselves. The other
-- two did not.
--
-- Weather is a link, so it stays in `links` and gains a kind beside it — the
-- gauge and the forecast read differently from the permit portal, and a block
-- called Weather is the thing someone is looking for at 0500. jsonb, so no
-- column for it: an entry is {url, label, kind?}.
--
-- A contact is not a link. The ranger district, the landowner, the gate code —
-- a name and a number, sometimes an email, sometimes a sentence about when to
-- ring. Squeezing that into a URL is how it ends up in somebody's phone and
-- nowhere else.
alter table public.venues
  add column if not exists contacts jsonb not null default '[]'::jsonb;

comment on column public.venues.contacts is
  'Who to ring about this place: [{name, role, phone, email, note}].';

comment on column public.venues.links is
  'Standing links for the region: [{url, label, kind}] where kind is weather | access | other.';
