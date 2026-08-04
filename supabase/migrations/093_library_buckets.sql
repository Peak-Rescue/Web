-- Four libraries, not one pile.
--
-- Merging two canyon deliveries into one template dragged Taiwan's travel
-- logistics and waiver QR onto a Maui course, because everything lived in one
-- undifferentiated library. Splitting by what material *is* fixes that at the
-- source: only teaching material belongs in a course template. Maps come from
-- the venue, resources and instructor material get pulled in as needed, and
-- per-delivery logistics live on the course itself.
--
--   teaching   — how-to material: technique videos, skill sheets, walkthroughs
--   resource   — external reference: manuals, tech notes, standards
--   map        — CalTopo/SARTopo and other maps
--   instructor — instructor-facing guides, outlines, teaching notes

alter table public.library_items
  add column if not exists bucket text not null default 'resource'
  check (bucket in ('teaching', 'resource', 'map', 'instructor'));

create index if not exists library_items_bucket_idx on public.library_items (bucket);

comment on column public.library_items.bucket is
  'Which library this belongs to. Only teaching material is carried by course templates.';
