-- Six of the twelve gear list templates hold no rows at all — just a link to
-- a Google Doc. They were made as templates because that was the only button
-- on the shelf, so the chip said "Gear list" while the thing was a document,
-- and the written-down ones filed as library rows said "Gear list (doc)"
-- beside them. Same shelf, same contents, two names.
--
-- So they become what they are: kit_list rows in the library, which is where
-- every other written-down list already lives. They keep their name, link,
-- audience, offerings, disciplines and place. Nothing points at a template by
-- id — a course copies one when it is built — so there is nothing to repoint.
--
-- Turning one back into a structured list is the same as building any other:
-- make a gear list and paste it in.
insert into library_items (title, url, source_type, kind, bucket, audience, disciplines, course_types, venue_id, site_id, region, topics, status)
select
  g.name,
  g.url,
  case when g.url ~ 'docs\.google\.com|drive\.google\.com' then 'drive' else 'link' end,
  'kit_list',
  'resource',
  case when g.audience = 'instructor' then 'internal' else 'shared' end,
  coalesce(g.disciplines, '{}'),
  coalesce(g.course_types, '{}'),
  g.venue_id,
  g.site_id,
  g.region,
  coalesce(g.topics, '{}'),
  'published'
from gear_lists g
where g.is_template = true
  and g.url is not null
  and not exists (select 1 from gear_list_entries e where e.list_id = g.id);

delete from gear_lists g
where g.is_template = true
  and g.url is not null
  and not exists (select 1 from gear_list_entries e where e.list_id = g.id);
