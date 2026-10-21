-- Running a course somewhere imported the whole reading list again under that
-- course's name. The Taiwan class brought 43 rows, and 22 of them point at
-- the same URL as a row we already had: the same rappel video, the same
-- rigging note, filed a second time because it was shown in Taiwan.
--
-- Matched on the URL, not the title. A title match would have caught "Manage
-- Your Event", which is two different documents, and missed nothing worth
-- catching — the pairs here are byte-identical links.
--
-- The 20 rows that are genuinely Taiwan's stay: the AAR, the SARTopo and
-- CalTopo maps, the daily risk and evac plan, the instructor equipment list,
-- the course outline, the photo albums.
create temporary table dupes on commit drop as
select distinct on (tw.id) tw.id as dupe_id, keep.id as keep_id
from library_items tw
join library_items keep
  on keep.url = tw.url
 and keep.id <> tw.id
 and coalesce(keep.source_class, '') <> 'Canyon Course — Taiwan'
where tw.source_class = 'Canyon Course — Taiwan'
  and tw.url is not null
order by tw.id, keep.created_at;

-- A course setup holding the duplicate is pointed at the copy that stays —
-- a template item is only a reference, so deleting underneath it would empty
-- that section. Where the section already holds the keeper, the duplicate
-- reference is simply dropped.
delete from course_template_items ti
using dupes d
where ti.item_id = d.dupe_id
  and exists (
    select 1 from course_template_items other
    where other.section_id = ti.section_id and other.item_id = d.keep_id
  );

update course_template_items ti
set item_id = d.keep_id
from dupes d
where ti.item_id = d.dupe_id;

delete from library_items where id in (select dupe_id from dupes);
