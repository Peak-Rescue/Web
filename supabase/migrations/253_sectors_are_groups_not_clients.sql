-- Sectors and subsectors are groupings, not clients.
--
-- The tree's top level ("PJs", "Industrial") was told apart from the clients
-- in it only by having no parent. That stops working the moment a group can
-- sit inside a group — Military › PJs › 24 STS — and the day a client can be
-- added before anyone has filed it, which is a top-level row that is not a
-- sector at all. So it is said out loud: a group is a sector (top level) or a
-- subsector (inside another group); everything else is a client, and a client
-- with no parent is one that has not been filed yet.
--
-- A course will only ever attach to a client, never to a group, and only a
-- client gets reviewers' ticks.
alter table public.clients
  add column if not exists is_group boolean not null default false;

update public.clients set is_group = true where parent_id is null and not is_group;

comment on column public.clients.is_group is
  'A sector (top level) or subsector (inside another group): a grouping, never a client. A client with no parent is unfiled.';
