-- Tyler Willingham, back where he can be seen.
--
-- He was added to Washington from the places page on Oct 23, after 267 had
-- moved contacts into their own table but while the form was still writing
-- into `region_info.contacts`. The write worked; the page reads
-- `contact_links`, so he vanished the moment the form closed. The form is
-- fixed; this is the one person it swallowed.
--
-- His email field holds "tyler.r.willingham@usda.gov, 425-395-0523" — an
-- address and a number in the box that asked for either — so they are split
-- here rather than left as an address nothing can mail.

insert into contacts (name, role, phone, email)
select
  'Tyler Willingham',
  'Special Uses Resource Specialist, Forest Service — Mt. Baker Snoqualmie National Forest',
  '425-395-0523',
  'tyler.r.willingham@usda.gov'
where not exists (select 1 from contacts where email = 'tyler.r.willingham@usda.gov');

insert into contact_links (contact_id, region_code)
select id, 'US-WA' from contacts where email = 'tyler.r.willingham@usda.gov'
on conflict do nothing;

-- Emptied, not kept as a second copy: nothing reads these arrays now, and a
-- copy left behind is the thing that comes back as a duplicate.
update region_info set contacts = '[]'::jsonb where region_code = 'US-WA';
