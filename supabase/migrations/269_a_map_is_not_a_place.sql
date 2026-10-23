-- "CocoCay Instructor Map" was never a venue.
--
-- It is a map of CocoCay, and filing it made a venue of its own title: a
-- place with no canyon, no contact and nothing in it but the one map, sitting
-- in the Bahamas beside the island it is a map of. The map moves to CocoCay
-- and the venue goes.

update library_items
   set venue_id = (select id from venues where name = 'CocoCay' and region_code = 'BS')
 where venue_id = (select id from venues where name = 'CocoCay Instructor Map');

delete from venues where name = 'CocoCay Instructor Map';

-- Two more people who fell down the same hole as Tyler (268): added from the
-- places page while the form still wrote into `venues.contacts`, which
-- nothing reads. Their phone numbers were typed into the email box, so they
-- are split out here rather than left as an address nothing can mail.
insert into contacts (name, role, phone, email)
select 'Joel Nowak', 'Forest Service — Gifford Pinchot', '360-819-3378', 'joel.nowak@usda.gov'
where not exists (select 1 from contacts where email = 'joel.nowak@usda.gov');

insert into contact_links (contact_id, venue_id)
select c.id, v.id from contacts c, venues v
 where c.email = 'joel.nowak@usda.gov' and v.name = 'Gifford Pinchot'
on conflict do nothing;

-- Tyler again, and the same Tyler: he holds the permits for Dingford Creek
-- and he is the state's special uses contact. One person, two homes — which
-- is the whole point of 267, and why this is a link and not a second row.
insert into contact_links (contact_id, venue_id)
select c.id, v.id from contacts c, venues v
 where c.email = 'tyler.r.willingham@usda.gov' and v.name = 'Dingford Creek'
on conflict do nothing;

-- Emptied, so nothing is left behind to come back as a duplicate. CocoCay's
-- lone entry is a row called "test" and is not brought across.
update venues set contacts = '[]'::jsonb
 where name in ('Gifford Pinchot', 'Dingford Creek', 'CocoCay');
