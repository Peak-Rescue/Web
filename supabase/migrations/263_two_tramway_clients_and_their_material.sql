-- The first material filed to a client.
--
-- Three rooms in the Classroom import were one client's: Bridger Bowl's
-- patrol manuals, Icy Strait Point's evacuation plans for their gondola and
-- zipline, Mighty Argo's for their cable car. Two of those clients did not
-- exist yet — they arrive under Tramways and parks, which is what they are.
--
-- The spelling in the import is "Icy Straight", which is not the place's
-- name; it goes in as an alias so a search for either finds it.
--
-- Not included: the Military Canyon Movement room, whose own name says
-- "Client Resource" without saying which, and whose contents are mostly our
-- own rigging videos. Nadav names that one.
insert into clients (name, aliases, parent_id, is_group, note)
select 'Icy Strait Point', array['Icy Straight', 'Icy Straight Point', 'Hoonah'],
       (select id from clients where is_group and name = 'Tramways and parks'), false,
       'Created from the Classroom room its evacuation plans came in under.'
where not exists (select 1 from clients where lower(name) = 'icy strait point');

insert into clients (name, aliases, parent_id, is_group, note)
select 'Mighty Argo', array['Argo', 'Mighty Argo Cable Car'],
       (select id from clients where is_group and name = 'Tramways and parks'), false,
       'Created from the Classroom room its evacuation plans came in under.'
where not exists (select 1 from clients where lower(name) = 'mighty argo');

update library_items set client_id = (select id from clients where name = 'Bridger Bowl' and not is_group), updated_at = now()
where client_id is null
  and (title ilike '%bridger bowl%' or replace(lower(title), ' ', '') like '%bridgerbowl%');

update library_items set client_id = (select id from clients where name = 'Icy Strait Point'), updated_at = now()
where client_id is null and source_class = 'Icy Straight';

update library_items set client_id = (select id from clients where name = 'Mighty Argo'), updated_at = now()
where client_id is null and source_class = 'Mighty Argo';
