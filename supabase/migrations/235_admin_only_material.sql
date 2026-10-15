-- Material only the five admins may see: permits, COIs, MOUs, operational
-- plans, testing information.
--
-- Deliberately NOT a third value on `audience`. That column is read as a
-- two-rung ladder in two dozen places — `=== 'shared'`, `!== 'shared'`,
-- `=== 'internal'` — and a third value would be silently reinterpreted by
-- every one of them in whichever direction that comparison happens to run.
-- `libraryLocked: item.audience === 'internal'` would read false for an
-- admin-only item and quietly unlock it. A missed case there fails open, on
-- the one kind of material where that is least acceptable.
--
-- A separate flag only ever adds a restriction. An admin-only item is still
-- `internal`, so every existing check keeps the meaning it already had and
-- goes on hiding it from students; this gate sits on top and hides it from
-- instructors too. A read path that forgets it fails back to instructors-only
-- rather than to the world.
alter table public.library_items
  add column if not exists admin_only boolean not null default false;

create index if not exists library_items_admin_only_idx
  on public.library_items (admin_only) where admin_only;

comment on column public.library_items.admin_only is
  'Visible only to profiles.role = admin. Never offered to a course. Sits on top of audience, never replaces it.';
