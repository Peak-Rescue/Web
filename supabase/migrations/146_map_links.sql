-- A map's links carry their own access and audience.
--
-- The old shape welded the two together: `url` meant read-only-for-students
-- and `edit_url` meant editable-for-instructors, and there was no way to say
-- anything else. Those are the two common cases and not the only ones — an
-- editable map handed to students on an exercise, a locked reference for staff
-- — and a schema that can only express the diagonal quietly decides what you
-- are allowed to do.
--
-- So a map has links, and a link is a URL plus the two facts about it. There
-- are no link names: the same map at a different access is still that map, and
-- a genuinely different map is a different library entry.
--
-- Only maps use this. The other 819 items in the library have one link and
-- never meet any of it.

create table if not exists public.library_item_links (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  item_id     uuid not null references public.library_items on delete cascade,
  url         text not null,
  -- What you can do with it once it opens.
  access      text not null check (access in ('read', 'edit')),
  -- Who may be handed it. Independent of access, which is the whole point.
  audience    text not null check (audience in ('students', 'instructors')),
  -- One link per combination: two editable instructor links to the same map is
  -- a mistake, not a use case. A second genuinely different map is a second
  -- library entry.
  unique (item_id, access, audience)
);

create index if not exists library_item_links_item_idx
  on public.library_item_links (item_id);

alter table public.library_item_links enable row level security;

-- Readable by anyone signed in; the audience column decides what is shown to
-- whom, and the portal reads with the service role and applies it there.
-- Writes go through admin server actions.
drop policy if exists "library_item_links: read" on public.library_item_links;
create policy "library_item_links: read"
  on public.library_item_links for select using (auth.uid() is not null);

drop policy if exists "library_item_links: admin write" on public.library_item_links;
create policy "library_item_links: admin write"
  on public.library_item_links for all
  using (public.is_admin()) with check (public.is_admin());

grant select on public.library_item_links to authenticated;

-- ─── Carrying the existing maps over ────────────────────────────────────────
--
-- Deliberately conservative about who sees what: a map's existing audience is
-- carried onto its main link unchanged, even where that means an instructors'
-- audience on a link that looks like a student share. Widening it is a
-- decision for a person to make in the editor, not something a migration
-- should do on everyone's behalf while nobody is watching.

insert into public.library_item_links (item_id, url, access, audience)
select id, url, 'read',
       case when audience = 'shared' then 'students' else 'instructors' end
  from public.library_items
 where kind = 'map' and url is not null and url <> ''
on conflict (item_id, access, audience) do nothing;

insert into public.library_item_links (item_id, url, access, audience)
select id, edit_url, 'edit', 'instructors'
  from public.library_items
 where kind = 'map' and edit_url is not null and edit_url <> ''
on conflict (item_id, access, audience) do nothing;

-- ─── One answer to "who can see this map" ───────────────────────────────────
--
-- A map attached to a course kept its own audience alongside the library
-- item's, so the same question was answered twice and the answers could
-- disagree — which they did: a map marked shared on the course while its
-- library entry said internal, showing students nothing and looking broken.
--
-- The library's answer is the default now. A course may still overrule it for
-- one delivery, but only by saying so, which is what this column records.

alter table public.course_maps
  add column if not exists audience_overridden boolean not null default false;

comment on column public.course_maps.audience_overridden is
  'False: this course follows the library item. True: someone deliberately '
  'chose a different audience for this delivery and the audience column wins.';
