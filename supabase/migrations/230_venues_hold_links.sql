-- A venue can hold links, the way a site already can.
--
-- A venue has carried nothing but a name, a region, a client and a note since
-- it was made, so everything true about a region had to become a library_item
-- tagged to it — which works for a document and not at all for a link. Area
-- weather, the river gauge, the permit portal, the hospital, the drive from
-- the airport: all of them are one URL and a label, none of them is teaching
-- material, and the library has no shelf that means "this is about where we
-- are".
--
-- So they were typed onto the course as an update instead. An update is dated,
-- addressed and emailed — the wrong shape entirely for a standing fact — and
-- it dies with the course, so the next course at the same venue starts by
-- remembering to do it again.
--
-- Same column, same shape and same validation as sites.links: [{url, label}].
-- The division between the two is the one the site table already draws — the
-- canyon's own links (route page, gauge for that drainage, driving pin) belong
-- to the site; what is true of the whole region belongs here.
alter table public.venues
  add column if not exists links jsonb not null default '[]'::jsonb;

comment on column public.venues.links is
  'Standing links for the region: weather, permit portal, hospital, driving. [{url,label}], same shape as sites.links.';
