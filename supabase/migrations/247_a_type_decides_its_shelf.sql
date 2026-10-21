-- The type decides the shelf, and has since the type control started setting
-- both. These rows were typed before it did, so about a hundred of them say
-- one thing and sit somewhere else — which is why the Reference shelf grew
-- headings for Presentation, Form and Photos, each holding rows that are not
-- reference material at all.
--
-- The map is the one in lib/library.ts (BUCKET_FOR_KIND). Kinds absent from
-- it are left alone: a kit list and a photo album read on cards that are not
-- buckets, so whatever bucket they carry is a leftover with nothing to say,
-- and KINDS_OFF_BUCKET_SHELVES keeps it off the shelves.
update library_items set bucket = 'resource',   updated_at = now() where kind in ('manual', 'tech_note', 'standard')         and bucket <> 'resource';
update library_items set bucket = 'teaching',   updated_at = now() where kind in ('presentation', 'skill_sheet')             and bucket <> 'teaching';
update library_items set bucket = 'instructor', updated_at = now() where kind in ('outline', 'debrief')                      and bucket <> 'instructor';
update library_items set bucket = 'documents',  updated_at = now() where kind in ('form', 'brand', 'permit', 'medevac', 'route') and bucket <> 'documents';
update library_items set bucket = 'map',        updated_at = now() where kind = 'map'                                        and bucket <> 'map';
