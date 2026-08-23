-- Every course asks for a waiver, without anyone having to remember.
--
-- Attaching one was a per-course decision, which was right while the feature
-- was new and wrong the moment it was trusted: the failure is silent. A course
-- created without a waiver doesn't complain, it simply never asks anybody to
-- sign, and you find out when you go looking for a signature that was never
-- collected.
--
-- So the default moves into the database rather than into whichever screen
-- happened to create the course. There is more than one way a course comes
-- into being — the admin form, an import, a script — and a rule that lives in
-- one of them is a rule the others don't follow.

-- Which template new courses get. A flag rather than "the only one there is",
-- so a second template can exist without silently changing what everyone signs.
alter table public.waiver_templates
  add column if not exists is_default boolean not null default false;

-- Exactly one default, enforced rather than agreed.
create unique index if not exists waiver_templates_one_default
  on public.waiver_templates (is_default) where is_default;

update public.waiver_templates
   set is_default = true
 where slug = 'elevated-safety-release'
   and not exists (select 1 from public.waiver_templates where is_default);

-- ─── New courses ────────────────────────────────────────────────────────────

create or replace function public.course_default_waiver()
returns trigger language plpgsql as $$
begin
  -- Only fills a blank. A course created with a waiver already chosen keeps
  -- it, so this can never override a deliberate choice — including the
  -- deliberate choice a template-copy or an import made on purpose.
  if new.waiver_template_id is null then
    select id into new.waiver_template_id
      from public.waiver_templates
     where is_default and archived_at is null
     limit 1;
  end if;
  return new;
end;
$$;

drop trigger if exists course_instances_default_waiver on public.course_instances;
create trigger course_instances_default_waiver
  before insert on public.course_instances
  for each row execute function public.course_default_waiver();

-- ─── Courses that already exist ─────────────────────────────────────────────
--
-- Every one of them, cancelled and finished included. Those have no students
-- so nothing changes for anybody, and "every course has a waiver" being true
-- without exception is easier to hold in your head than a rule about which
-- ones do. What it does change is the courses still to run, where the students
-- on them will be asked to sign the next time they open their course page.

update public.course_instances
   set waiver_template_id = (
         select id from public.waiver_templates
          where is_default and archived_at is null limit 1
       )
 where waiver_template_id is null;
