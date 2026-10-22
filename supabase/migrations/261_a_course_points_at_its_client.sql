-- A course points at its client, and its client name is a copy the database
-- keeps.
--
-- client_name was typed, and 44 spellings of 30-odd clients is what typing
-- produces. From here a course carries client_id, chosen from the client tree,
-- and client_name stops being something anyone writes: it is set from the tree
-- whenever the course's client is set, and rewritten on every course whenever
-- a client is renamed or re-filed. The fifty-odd places that show a course's
-- client go on reading client_name and simply always read the tree's name.
--
-- A team reads with the client it belongs to — "24 STS – Red Team", not a bare
-- "Red Team" on a quote — and stops at the first sector or subsector above it,
-- which is filing, not part of anybody's name.
--
-- Lenient on purpose while this deploys. A course with no client_id keeps
-- whatever client_name it has, so the code still live until the new deploy
-- lands (which writes client_name and not client_id) loses nothing. Once
-- nothing writes client_name, the only way a name gets onto a course is this.

alter table public.course_instances
  add column if not exists client_id uuid references public.clients(id) on delete restrict;
create index if not exists course_instances_client_idx on public.course_instances (client_id);

comment on column public.course_instances.client_id is
  'The client this course is for, from the client tree. client_name is derived from it.';
comment on column public.course_instances.client_name is
  'Read-only copy of the client''s name from the tree (see client_label). Never write it directly.';

-- "24 STS – Red Team": the client and the clients above it, up to the first
-- group.
create or replace function public.client_label(cid uuid) returns text
language sql stable as $$
  with recursive up as (
    select id, parent_id, name, is_group, 0 as depth from public.clients where id = cid
    union all
    select c.id, c.parent_id, c.name, c.is_group, up.depth + 1
      from public.clients c join up on c.id = up.parent_id
     where not c.is_group
  )
  select string_agg(name, ' – ' order by depth desc) from up where not is_group
$$;

create or replace function public.course_client_name_from_tree() returns trigger
language plpgsql as $$
begin
  if new.client_id is not null then
    new.client_name := public.client_label(new.client_id);
  elsif tg_op = 'UPDATE' and old.client_id is not null then
    -- The client was taken off the course: so is its name.
    new.client_name := null;
  end if;
  return new;
end $$;

drop trigger if exists course_client_name_from_tree on public.course_instances;
create trigger course_client_name_from_tree
  before insert or update of client_id, client_name on public.course_instances
  for each row execute procedure public.course_client_name_from_tree();

-- A rename, a re-file or a change of kind can change the label of the client
-- and of every team beneath it, so every course under the changed node is
-- re-read.
create or replace function public.client_relabel_courses() returns trigger
language plpgsql as $$
begin
  with recursive down as (
    select new.id as id
    union all
    select c.id from public.clients c join down on c.parent_id = down.id
  )
  update public.course_instances ci
     set client_name = public.client_label(ci.client_id)
   where ci.client_id in (select id from down);
  return null;
end $$;

drop trigger if exists client_relabel_courses on public.clients;
create trigger client_relabel_courses
  after update of name, parent_id, is_group on public.clients
  for each row execute procedure public.client_relabel_courses();

-- Folding a duplicate into the real client, in one transaction: its courses,
-- anything filed under it, and every name it was known by move across, and
-- then it goes. Its own name becomes an alias of the client it joins, so a
-- search for the old name still lands somewhere.
create or replace function public.merge_clients(from_id uuid, into_id uuid) returns void
language plpgsql as $$
declare
  src public.clients%rowtype;
  dst public.clients%rowtype;
begin
  if from_id = into_id then raise exception 'A client cannot be merged into itself'; end if;
  select * into src from public.clients where id = from_id;
  select * into dst from public.clients where id = into_id;
  if src.id is null or dst.id is null then raise exception 'That client no longer exists'; end if;
  if src.is_group or dst.is_group then raise exception 'Only clients can be merged, not sectors'; end if;
  if exists (
    with recursive down as (
      select from_id as id
      union all
      select c.id from public.clients c join down on c.parent_id = down.id
    ) select 1 from down where id = into_id
  ) then raise exception 'A client cannot be merged into one of its own teams'; end if;

  update public.course_instances set client_id = into_id where client_id = from_id;
  update public.clients set parent_id = into_id where parent_id = from_id;
  update public.clients
     set aliases = (
       select coalesce(array_agg(distinct a), '{}') from unnest(dst.aliases || src.aliases || array[src.name]) a
        where lower(trim(a)) <> lower(trim(dst.name))
     )
   where id = into_id;
  delete from public.clients where id = from_id;
end $$;

-- ─── Backfill ────────────────────────────────────────────────────────────────
-- Each course's typed name is matched to the client tree: by name first, then
-- by alias, ignoring case and runs of spaces. Only an unambiguous match is
-- taken; anything else is left for a person.
with norm_course as (
  select id, regexp_replace(lower(trim(client_name)), '\s+', ' ', 'g') as n
    from public.course_instances
   where client_name is not null and client_id is null
), by_name as (
  select nc.id as course_id, min(c.id::text)::uuid as client_id, count(*) as hits
    from norm_course nc
    join public.clients c on not c.is_group and regexp_replace(lower(trim(c.name)), '\s+', ' ', 'g') = nc.n
   group by nc.id
), by_alias as (
  select nc.id as course_id, min(c.id::text)::uuid as client_id, count(distinct c.id) as hits
    from norm_course nc
    join public.clients c on not c.is_group
    join lateral unnest(c.aliases) a on regexp_replace(lower(trim(a)), '\s+', ' ', 'g') = nc.n
   where nc.id not in (select course_id from by_name)
   group by nc.id
), matched as (
  select course_id, client_id from by_name where hits = 1
  union all
  select course_id, client_id from by_alias where hits = 1
)
update public.course_instances ci set client_id = m.client_id from matched m where ci.id = m.course_id;

-- Revac is the company of ours that runs the SWAT courses, not the client, so
-- it is deliberately not an alias of anything and is matched by hand here.
update public.course_instances
   set client_id = (select id from public.clients where name = 'Denver SWAT' and not is_group limit 1)
 where client_id is null and trim(client_name) = 'Revac - Denver SWAT';
