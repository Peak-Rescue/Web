-- A map can name the canyon, not just the region.
--
-- Maps were filed by venue, which is the area a course is sold against, and
-- that is the right grain for "Maui maps" and the wrong one for the four maps
-- that are about one drainage: dingford canyon, Dingford Creek on ropewiki,
-- the Dingford SARTopo, Mineral Creek. Filed at venue level they are offered
-- to every course anywhere in the region, and one of them — Mineral Creek, in
-- the Alpine Lakes — was filed to Dingford Creek because there was no truer
-- place to put it.
--
-- So a map may name a site. The venue stays and stays required for a map: it
-- is what the course-side matching reads, and it is derived from the site when
-- one is named rather than asked for twice. One place, two levels of
-- precision, and no way for the two to contradict each other.
alter table public.library_items
  add column if not exists site_id uuid references public.sites(id) on delete set null;

create index if not exists library_items_site_idx on public.library_items (site_id);

comment on column public.library_items.site_id is
  'The specific canyon/crag this is about, when it is about one. venue_id is still set, derived from the site.';
